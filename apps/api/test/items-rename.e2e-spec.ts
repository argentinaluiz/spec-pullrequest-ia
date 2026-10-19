import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { v7 as uuidv7 } from 'uuid';
import { storageConfig } from '../src/config/storage.config.js';
import { authRoutes } from './support/auth-routes.js';
import { createTestApp } from './support/create-test-app.js';
import { itemRoutes } from './support/items.js';
import { uniqueEmail } from './support/mailpit.js';
import {
  expectProblem,
  expectValidationError,
  NOT_FOUND,
} from './support/problem.js';
import { getSignedUrlOnEmulator } from './support/storage-emulator.js';
import { uploadRoutes } from './support/uploads.js';

interface ItemBody {
  id: string;
  type: string;
  name: string;
  updatedAt: string;
}

interface ListBody {
  items: ItemBody[];
}

describe('Renomear Itens', () => {
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

  describe('PATCH /items/{id}', () => {
    it(
      'renomeia a pasta e o arquivo, sem os espaços das pontas e com a data atualizada',
      { tags: ['@LUI-180-CA1'] },
      async () => {
        const { accessToken, userId, rootId } = await signedInUser();
        const longAgo = new Date('2020-01-01T00:00:00Z');
        const [folderId, fileId] = await items.seed(userId, rootId, [
          { name: 'Fotos', type: 'folder', updatedAt: longAgo },
          { name: 'relatorio.txt', updatedAt: longAgo },
        ]);

        for (const id of [folderId, fileId]) {
          const response = await items
            .rename(id, accessToken, { name: '  Novo nome  ' })
            .expect(200);

          const body = response.body as ItemBody;
          expect(body).toMatchObject({ id, name: 'Novo nome' });
          expect(new Date(body.updatedAt).getTime()).toBeGreaterThan(
            longAgo.getTime(),
          );
        }
        const list = await items.listChildren('root', accessToken).expect(200);
        expect((list.body as ListBody).items.map((i) => i.name)).toEqual([
          'Novo nome',
          'Novo nome',
        ]);
      },
    );

    it(
      'aceita um nome igual ao de um irmão',
      { tags: ['@LUI-180-CA1'] },
      async () => {
        const { accessToken, userId, rootId } = await signedInUser();
        const [, fileId] = await items.seed(userId, rootId, [
          { name: 'Novo nome', type: 'folder' },
          { name: 'relatorio.txt' },
        ]);

        await items
          .rename(fileId, accessToken, { name: 'Novo nome' })
          .expect(200);

        const list = await items.listChildren('root', accessToken).expect(200);
        expect((list.body as ListBody).items.map((i) => i.name)).toEqual([
          'Novo nome',
          'Novo nome',
        ]);
      },
    );

    it(
      'recusa o nome inválido com validation_error',
      { tags: ['@LUI-180-CA2'] },
      async () => {
        const { accessToken, userId, rootId } = await signedInUser();
        const [fileId] = await items.seed(userId, rootId, [
          { name: 'relatorio.txt' },
        ]);
        const inputs: object[] = [
          {},
          { name: '' },
          { name: '   ' },
          { name: 'a/b' },
          { name: 'a'.repeat(256) },
        ];

        for (const input of inputs) {
          const response = await items.rename(fileId, accessToken, input);
          expectValidationError(response, 'name');
        }
        const list = await items.listChildren('root', accessToken).expect(200);
        expect((list.body as ListBody).items.map((i) => i.name)).toEqual([
          'relatorio.txt',
        ]);
      },
    );

    it(
      'mede os 255 caracteres depois de descartar os espaços das pontas',
      { tags: ['@LUI-180-CA2'] },
      async () => {
        const { accessToken, userId, rootId } = await signedInUser();
        const [fileId] = await items.seed(userId, rootId, [
          { name: 'relatorio.txt' },
        ]);
        const name = 'a'.repeat(255);

        const exact = await items.rename(fileId, accessToken, { name });
        const padded = await items.rename(fileId, accessToken, {
          name: ` ${name} `,
        });

        expect(exact.status).toBe(200);
        expect(padded.status).toBe(200);
        expect((padded.body as ItemBody).name).toBe(name);
      },
    );

    it(
      'recusa renomear a Pasta raiz, pelo id e pelo atalho root',
      { tags: ['@LUI-180-CA3'] },
      async () => {
        const { accessToken, rootId } = await signedInUser();

        for (const id of [rootId, 'root']) {
          const response = await items.rename(id, accessToken, {
            name: 'Outro nome',
          });
          expectValidationError(response, 'id');
        }

        const detail = await items.get('root', accessToken).expect(200);
        expect(
          (detail.body as { trail: { name: string }[] }).trail.map(
            (entry) => entry.name,
          ),
        ).toEqual(['Meus arquivos']);
      },
    );

    it(
      'responde not_found ao Item que não é ativo e do Usuário',
      { tags: ['@LUI-180-CA4'] },
      async () => {
        const owner = await signedInUser();
        const other = await signedInUser();
        const [othersFile] = await items.seed(other.userId, other.rootId, [
          { name: 'de-outro.txt' },
        ]);
        const [pending] = await items.seed(owner.userId, owner.rootId, [
          { name: 'pendente.txt', status: 'pending' },
        ]);

        for (const id of [othersFile, uuidv7(), 'nao-e-uuid', pending]) {
          const response = await items.rename(id, owner.accessToken, {
            name: 'Novo nome',
          });
          expectProblem(response, NOT_FOUND);
        }

        const othersList = await items.listChildren('root', other.accessToken);
        expect((othersList.body as ListBody).items.map((i) => i.name)).toEqual([
          'de-outro.txt',
        ]);
      },
    );

    it(
      'responde unauthenticated sem o token',
      { tags: ['@LUI-180-CA4'] },
      async () => {
        const { userId, rootId } = await signedInUser();
        const [fileId] = await items.seed(userId, rootId, [
          { name: 'relatorio.txt' },
        ]);

        const response = await items.rename(fileId, undefined, {
          name: 'Novo nome',
        });

        expect(response.status).toBe(401);
        expect((response.body as { code: string }).code).toBe(
          'unauthenticated',
        );
      },
    );

    it(
      'entrega o download com o nome novo',
      { tags: ['@LUI-180-CA5'] },
      async () => {
        const { accessToken } = await signedInUser();
        const { itemId, uploadUrl } = await uploads.start(accessToken, {
          name: 'original.txt',
          sizeBytes: 5,
        });
        await uploads.putBytes(uploadUrl, 'ola!!');
        await uploads.complete(accessToken, itemId).expect(200);
        await items
          .rename(itemId, accessToken, { name: 'novo.txt' })
          .expect(200);

        const response = await items.downloadUrl(itemId, accessToken);
        const { url } = response.body as { url: string };
        const delivered = await getSignedUrlOnEmulator(
          app.get<{ emulatorHost?: string }>(storageConfig.KEY).emulatorHost,
          url,
        );

        expect(delivered.body.toString()).toBe('ola!!');
        expect(delivered.headers['content-disposition']).toBe(
          "attachment; filename*=UTF-8''novo.txt",
        );
      },
    );
  });
});
