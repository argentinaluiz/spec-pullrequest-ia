import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { v7 as uuidv7 } from 'uuid';
import { authRoutes } from './support/auth-routes.js';
import { createTestApp } from './support/create-test-app.js';
import { itemRoutes } from './support/items.js';
import { uniqueEmail } from './support/mailpit.js';
import {
  expectProblem,
  expectValidationError,
  NOT_FOUND,
} from './support/problem.js';
import { uploadRoutes } from './support/uploads.js';

interface ListBody {
  items: { id: string; type: string; name: string }[];
  nextCursor: string | null;
}

describe('Pastas', () => {
  let app: INestApplication<App>;
  let auth: ReturnType<typeof authRoutes>;
  let items: ReturnType<typeof itemRoutes>;
  let uploads: ReturnType<typeof uploadRoutes>;

  beforeAll(async () => {
    app = await createTestApp();
    auth = authRoutes(app);
    items = itemRoutes(app);
    uploads = uploadRoutes(app);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Um Usuário verificado, com Sessão, e o id dele e o da Pasta raiz. */
  const signedInUser = async () => {
    const { accessToken } = await auth.openSession(uniqueEmail());
    const { body } = await auth.me(accessToken).expect(200);
    const userId = (body as { id: string }).id;
    return {
      accessToken,
      userId,
      rootId: await items.rootId(accessToken, userId),
    };
  };

  /** Uma cadeia de `length` pastas dentro de `parentId`, a primeira no nível 1 se for a raiz. Devolve os ids, do topo ao fim. */
  const folderChain = async (
    userId: string,
    parentId: string,
    length: number,
  ) => {
    const ids: string[] = [];
    let current = parentId;
    for (let level = 1; level <= length; level++) {
      [current] = await items.seed(userId, current, [
        { name: `nivel-${level}`, type: 'folder' },
      ]);
      ids.push(current);
    }
    return ids;
  };

  describe('GET /items/{id}', () => {
    it(
      'responde a trilha do topo até a pasta',
      { tags: ['@LUI-179-CA1'] },
      async () => {
        const { accessToken, userId, rootId } = await signedInUser();
        const [first, second, third] = await folderChain(userId, rootId, 3);

        const response = await items.get(third, accessToken).expect(200);
        const rootResponse = await items.get('root', accessToken).expect(200);

        expect(response.body).toEqual({
          item: {
            id: third,
            type: 'folder',
            name: 'nivel-3',
            sizeBytes: 0,
            mimeType: null,
            updatedAt: expect.any(String),
          },
          trail: [
            { id: rootId, name: 'Meus arquivos' },
            { id: first, name: 'nivel-1' },
            { id: second, name: 'nivel-2' },
            { id: third, name: 'nivel-3' },
          ],
        });
        expect(rootResponse.body.trail).toEqual([
          { id: rootId, name: 'Meus arquivos' },
        ]);
      },
    );

    it(
      'responde not_found à trilha de um id que não é de uma pasta ativa do Usuário',
      { tags: ['@LUI-179-CA1'] },
      async () => {
        const owner = await signedInUser();
        const other = await signedInUser();
        const [othersFolder] = await items.seed(other.userId, other.rootId, [
          { name: 'de-outro', type: 'folder' },
        ]);
        const [file, pending] = await items.seed(owner.userId, owner.rootId, [
          { name: 'arquivo.txt' },
          { name: 'pendente', type: 'folder', status: 'pending' },
        ]);

        const responses = await Promise.all(
          [uuidv7(), othersFolder, file, 'nao-e-uuid', pending].map((id) =>
            items.get(id, owner.accessToken),
          ),
        );

        for (const response of responses) {
          expect(response.status).toBe(404);
          expectProblem(response, NOT_FOUND);
        }
      },
    );
  });

  describe('GET /items/{id}/children', () => {
    it(
      'lista os filhos de uma pasta, paginada e na ordem do contrato',
      { tags: ['@LUI-179-CA2'] },
      async () => {
        const { accessToken, userId, rootId } = await signedInUser();
        const [folder] = await items.seed(userId, rootId, [
          { name: 'pasta', type: 'folder' },
        ]);
        const [, , , , file] = await items.seed(userId, folder, [
          { name: 'z-pasta', type: 'folder' },
          { name: 'b-pasta', type: 'folder' },
          { name: 'c.txt' },
          { name: 'pendente.txt', status: 'pending' },
          { name: 'a.txt' },
        ]);

        const first = await items
          .listChildren(folder, accessToken, { limit: 2 })
          .expect(200);
        const second = await items
          .listChildren(folder, accessToken, {
            limit: 2,
            cursor: (first.body as ListBody).nextCursor ?? '',
          })
          .expect(200);

        expect((first.body as ListBody).items.map((i) => i.name)).toEqual([
          'b-pasta',
          'z-pasta',
        ]);
        expect((first.body as ListBody).nextCursor).toEqual(expect.any(String));
        expect((second.body as ListBody).items.map((i) => i.name)).toEqual([
          'a.txt',
          'c.txt',
        ]);
        expect((second.body as ListBody).items[0].id).toBe(file);
        expect((second.body as ListBody).nextCursor).toBeNull();
      },
    );

    it(
      'filtra só as pastas com type=folder',
      { tags: ['@LUI-179-CA2'] },
      async () => {
        const { accessToken, userId, rootId } = await signedInUser();
        await items.seed(userId, rootId, [
          { name: 'a', type: 'folder' },
          { name: 'b', type: 'folder' },
          { name: 'c', type: 'folder' },
          { name: 'arquivo.txt' },
        ]);

        const first = await items
          .listChildren('root', accessToken, { type: 'folder', limit: 2 })
          .expect(200);
        const second = await items
          .listChildren('root', accessToken, {
            type: 'folder',
            limit: 2,
            cursor: (first.body as ListBody).nextCursor ?? '',
          })
          .expect(200);
        const invalid = await items.listChildren('root', accessToken, {
          type: 'file',
        });

        expect((first.body as ListBody).items.map((i) => i.name)).toEqual([
          'a',
          'b',
        ]);
        expect((second.body as ListBody).items.map((i) => i.name)).toEqual([
          'c',
        ]);
        expect((second.body as ListBody).nextCursor).toBeNull();
        expectValidationError(invalid, 'type');
      },
    );

    it(
      'responde not_found à lista de uma pasta que não é do Usuário',
      { tags: ['@LUI-179-CA2'] },
      async () => {
        const owner = await signedInUser();
        const other = await signedInUser();
        const [othersFolder] = await items.seed(other.userId, other.rootId, [
          { name: 'de-outro', type: 'folder' },
        ]);
        const [file] = await items.seed(owner.userId, owner.rootId, [
          { name: 'arquivo.txt' },
        ]);

        const responses = await Promise.all(
          [uuidv7(), othersFolder, file].map((id) =>
            items.listChildren(id, owner.accessToken),
          ),
        );

        for (const response of responses) {
          expect(response.status).toBe(404);
          expectProblem(response, NOT_FOUND);
        }
      },
    );
  });

  describe('POST /folders', () => {
    it(
      'cria a pasta sem os espaços das pontas e aceita nome igual',
      { tags: ['@LUI-179-CA3'] },
      async () => {
        const { accessToken, userId, rootId } = await signedInUser();
        const [parent] = await items.seed(userId, rootId, [
          { name: 'Fotos', type: 'folder' },
        ]);

        const inRoot = await items
          .createFolder(accessToken, { name: '  Fotos  ', parentId: 'root' })
          .expect(201);
        const inFolder = await items
          .createFolder(accessToken, { name: '  Fotos  ', parentId: parent })
          .expect(201);
        const rootList = await items.listChildren('root', accessToken);
        const folderList = await items.listChildren(parent, accessToken);

        expect(inRoot.body).toEqual({
          id: expect.any(String),
          type: 'folder',
          name: 'Fotos',
          sizeBytes: 0,
          mimeType: null,
          updatedAt: expect.any(String),
        });
        expect((rootList.body as ListBody).items.map((i) => i.name)).toEqual([
          'Fotos',
          'Fotos',
        ]);
        expect(inFolder.body).toMatchObject({
          type: 'folder',
          name: 'Fotos',
          sizeBytes: 0,
          mimeType: null,
        });
        expect((folderList.body as ListBody).items.map((i) => i.id)).toEqual([
          (inFolder.body as { id: string }).id,
        ]);
      },
    );

    it(
      'recusa o nome inválido com validation_error',
      { tags: ['@LUI-179-CA4'] },
      async () => {
        const { accessToken } = await signedInUser();
        const inputs: object[] = [
          { name: '', parentId: 'root' },
          { name: '   ', parentId: 'root' },
          { name: 'a/b', parentId: 'root' },
          { name: 'a'.repeat(256), parentId: 'root' },
          { parentId: 'root' },
        ];

        for (const input of inputs) {
          const response = await items.createFolder(accessToken, input);
          expectValidationError(response, 'name');
        }
        const list = await items.listChildren('root', accessToken);

        expect((list.body as ListBody).items).toEqual([]);
      },
    );

    it(
      'mede os 255 caracteres depois de descartar os espaços das pontas',
      { tags: ['@LUI-179-CA4'] },
      async () => {
        const { accessToken } = await signedInUser();
        const name = 'a'.repeat(255);

        const exact = await items.createFolder(accessToken, {
          name,
          parentId: 'root',
        });
        const padded = await items.createFolder(accessToken, {
          name: ` ${name} `,
          parentId: 'root',
        });

        expect(exact.status).toBe(201);
        expect(padded.status).toBe(201);
        expect(padded.body.name).toBe(name);
      },
    );

    it(
      'responde not_found a um destino que não é uma pasta ativa do Usuário',
      { tags: ['@LUI-179-CA5'] },
      async () => {
        const owner = await signedInUser();
        const other = await signedInUser();
        const [othersFolder] = await items.seed(other.userId, other.rootId, [
          { name: 'de-outro', type: 'folder' },
        ]);
        const [file, pending] = await items.seed(owner.userId, owner.rootId, [
          { name: 'arquivo.txt' },
          { name: 'pendente', type: 'folder', status: 'pending' },
        ]);

        for (const parentId of [
          uuidv7(),
          'nao-e-uuid',
          file,
          othersFolder,
          pending,
        ]) {
          const response = await items.createFolder(owner.accessToken, {
            name: 'Nova',
            parentId,
          });
          expect(response.status).toBe(404);
          expectProblem(response, NOT_FOUND);
        }
      },
    );

    it(
      'cria até o 50º nível e recusa o 51º com max_depth_exceeded',
      { tags: ['@LUI-179-CA5'] },
      async () => {
        const { accessToken, userId, rootId } = await signedInUser();
        const chain = await folderChain(userId, rootId, 50);

        const atLimit = await items.createFolder(accessToken, {
          name: 'ultima',
          parentId: chain[48],
        });
        const beyond = await items.createFolder(accessToken, {
          name: 'alem',
          parentId: chain[49],
        });
        const list = await items.listChildren(chain[49], accessToken);

        expect(atLimit.status).toBe(201);
        expectProblem(beyond, {
          title: 'Bad Request',
          status: 400,
          code: 'max_depth_exceeded',
          detail: expect.any(String),
        });
        expect((list.body as ListBody).items).toEqual([]);
      },
    );

    it(
      'cria a pasta com a conta somente leitura, sem mexer na Cota',
      { tags: ['@LUI-179-CA6'] },
      async () => {
        const { accessToken, userId } = await signedInUser();
        await uploads.leaveFreeBytes(userId, -1024);
        const usedBefore = await uploads.usedBytes(userId);
        const refusedUpload = await uploads.create(accessToken, {
          name: 'arquivo.txt',
          sizeBytes: 1,
          parentId: 'root',
        });

        const response = await items.createFolder(accessToken, {
          name: 'Somente leitura',
          parentId: 'root',
        });

        expect(refusedUpload.status).toBe(413);
        expect(refusedUpload.body.code).toBe('quota_exceeded');
        expect(response.status).toBe(201);
        expect(await uploads.usedBytes(userId)).toBe(usedBefore);
      },
    );
  });

  it('responde unauthenticated sem token de acesso', async () => {
    const response = await items.createFolder(undefined, {
      name: 'Nova',
      parentId: 'root',
    });

    expect(response.status).toBe(401);
  });
});
