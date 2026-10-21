import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { v7 as uuidv7 } from 'uuid';
import { authRoutes } from './support/auth-routes.js';
import { createTestApp } from './support/create-test-app.js';
import { itemRoutes } from './support/items.js';
import { uniqueEmail } from './support/mailpit.js';
import { expectProblem, NOT_FOUND } from './support/problem.js';

interface ItemBody {
  id: string;
  type: string;
  name: string;
  updatedAt: string;
}

interface ListBody {
  items: ItemBody[];
}

/** O corpo do `invalid_move`. */
const INVALID_MOVE = {
  title: 'Bad Request',
  status: 400,
  code: 'invalid_move',
  detail: expect.any(String),
};

/** O corpo do `max_depth_exceeded`. */
const MAX_DEPTH_EXCEEDED = {
  title: 'Bad Request',
  status: 400,
  code: 'max_depth_exceeded',
  detail: expect.any(String),
};

describe('Mover Itens', () => {
  let app: INestApplication<App>;
  let auth: ReturnType<typeof authRoutes>;
  let items: ReturnType<typeof itemRoutes>;

  beforeAll(async () => {
    app = await createTestApp();
    auth = authRoutes(app);
    items = itemRoutes(app);
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

  /** Os nomes dos filhos ativos da pasta, na ordem da lista. */
  const namesIn = async (folderId: string, accessToken: string) => {
    const list = await items.listChildren(folderId, accessToken).expect(200);
    return (list.body as ListBody).items.map((item) => item.name);
  };

  /**
   * Uma cadeia de `length` pastas, cada uma dentro da anterior, a primeira
   * dentro de `parentId`: devolve os ids, do topo ao fim.
   */
  const folderChain = async (
    userId: string,
    parentId: string,
    length: number,
  ) => {
    const ids: string[] = [];
    let parent = parentId;
    for (let level = 1; level <= length; level++) {
      const [id] = await items.seed(userId, parent, [
        { name: `N${level}`, type: 'folder' },
      ]);
      ids.push(id);
      parent = id;
    }
    return ids;
  };

  describe('PATCH /items/{id}', () => {
    it(
      'move a pasta e o arquivo para outra pasta',
      { tags: ['@LUI-181-CA1'] },
      async () => {
        const { accessToken, userId, rootId } = await signedInUser();
        const longAgo = new Date('2020-01-01T00:00:00Z');
        const [origin, target] = await items.seed(userId, rootId, [
          { name: 'Origem', type: 'folder' },
          { name: 'Destino', type: 'folder' },
        ]);
        const [folderId, fileId] = await items.seed(userId, origin, [
          { name: 'Fotos', type: 'folder', updatedAt: longAgo },
          { name: 'relatorio.txt', updatedAt: longAgo },
        ]);

        for (const id of [folderId, fileId]) {
          const response = await items
            .move(id, accessToken, target)
            .expect(200);

          const body = response.body as ItemBody;
          expect(body.id).toBe(id);
          expect(new Date(body.updatedAt).getTime()).toBeGreaterThan(
            longAgo.getTime(),
          );
        }

        expect(await namesIn(target, accessToken)).toEqual([
          'Fotos',
          'relatorio.txt',
        ]);
        expect(await namesIn(origin, accessToken)).toEqual([]);
      },
    );

    it(
      'move a pasta e o arquivo para a Pasta raiz pelo atalho root',
      { tags: ['@LUI-181-CA1'] },
      async () => {
        const { accessToken, userId, rootId } = await signedInUser();
        const [origin] = await items.seed(userId, rootId, [
          { name: 'Origem', type: 'folder' },
        ]);
        const [folderId, fileId] = await items.seed(userId, origin, [
          { name: 'Fotos', type: 'folder' },
          { name: 'relatorio.txt' },
        ]);

        for (const id of [folderId, fileId]) {
          await items.move(id, accessToken, 'root').expect(200);
        }

        expect(await namesIn('root', accessToken)).toEqual([
          'Fotos',
          'Origem',
          'relatorio.txt',
        ]);
        expect(await namesIn(origin, accessToken)).toEqual([]);
      },
    );

    it(
      'recusa mover a pasta para dentro dela mesma ou de uma descendente',
      { tags: ['@LUI-181-CA2'] },
      async () => {
        const { accessToken, userId, rootId } = await signedInUser();
        const [a] = await items.seed(userId, rootId, [
          { name: 'A', type: 'folder' },
        ]);
        const [b] = await items.seed(userId, a, [
          { name: 'B', type: 'folder' },
        ]);
        const [c] = await items.seed(userId, b, [
          { name: 'C', type: 'folder' },
        ]);

        for (const destination of [a, b, c]) {
          const response = await items.move(a, accessToken, destination);
          expectProblem(response, INVALID_MOVE);
        }

        expect(await namesIn('root', accessToken)).toEqual(['A']);
        expect(await namesIn(a, accessToken)).toEqual(['B']);
        expect(await namesIn(b, accessToken)).toEqual(['C']);
      },
    );

    it(
      'recusa mover a Pasta raiz, pelo id e pelo atalho root',
      { tags: ['@LUI-181-CA3'] },
      async () => {
        const { accessToken, userId, rootId } = await signedInUser();
        const [folderId] = await items.seed(userId, rootId, [
          { name: 'Fotos', type: 'folder' },
        ]);

        for (const id of [rootId, 'root']) {
          const response = await items.move(id, accessToken, folderId);
          expectProblem(response, INVALID_MOVE);
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
      'recusa o movimento que passa de 50 níveis pela altura da subárvore',
      { tags: ['@LUI-181-CA4'] },
      async () => {
        const { accessToken, userId, rootId } = await signedInUser();
        const [subtree] = await items.seed(userId, rootId, [
          { name: 'X', type: 'folder' },
        ]);
        await folderChain(userId, subtree, 9);
        const levels = await folderChain(userId, rootId, 41);

        const response = await items.move(subtree, accessToken, levels[40]);

        expectProblem(response, MAX_DEPTH_EXCEEDED);
        expect(await namesIn('root', accessToken)).toEqual(['N1', 'X']);
      },
    );

    it(
      'aceita o movimento que chega a exatamente 50 níveis',
      { tags: ['@LUI-181-CA4'] },
      async () => {
        const { accessToken, userId, rootId } = await signedInUser();
        const [subtree] = await items.seed(userId, rootId, [
          { name: 'X', type: 'folder' },
        ]);
        const inside = await folderChain(userId, subtree, 9);
        const levels = await folderChain(userId, rootId, 40);

        await items.move(subtree, accessToken, levels[39]).expect(200);

        const detail = await items.get(inside[8], accessToken).expect(200);
        expect((detail.body as { trail: unknown[] }).trail).toHaveLength(51);
      },
    );

    it(
      'aceita mover para onde o Item já está, sem alterar nada',
      { tags: ['@LUI-181-CA5'] },
      async () => {
        const { accessToken, userId, rootId } = await signedInUser();
        const longAgo = new Date('2020-01-01T00:00:00Z');
        const [origin] = await items.seed(userId, rootId, [
          { name: 'Origem', type: 'folder', updatedAt: longAgo },
        ]);
        const [folderId, fileId] = await items.seed(userId, origin, [
          { name: 'Fotos', type: 'folder', updatedAt: longAgo },
          { name: 'relatorio.txt', updatedAt: longAgo },
        ]);

        const responses = [
          await items.move(folderId, accessToken, origin),
          await items.move(fileId, accessToken, origin),
          await items.move(origin, accessToken, 'root'),
        ];

        for (const response of responses) {
          expect(response.status).toBe(200);
          expect((response.body as ItemBody).updatedAt).toBe(
            longAgo.toISOString(),
          );
        }
        expect(await namesIn(origin, accessToken)).toEqual([
          'Fotos',
          'relatorio.txt',
        ]);
      },
    );

    it(
      'responde not_found ao destino que não é uma pasta ativa do Usuário',
      { tags: ['@LUI-181-CA6'] },
      async () => {
        const owner = await signedInUser();
        const other = await signedInUser();
        const [folderId, fileId] = await items.seed(
          owner.userId,
          owner.rootId,
          [{ name: 'Fotos', type: 'folder' }, { name: 'relatorio.txt' }],
        );
        const [othersFolder] = await items.seed(other.userId, other.rootId, [
          { name: 'De outro', type: 'folder' },
        ]);

        for (const destination of [
          fileId,
          othersFolder,
          uuidv7(),
          'nao-e-uuid',
        ]) {
          const response = await items.move(
            folderId,
            owner.accessToken,
            destination,
          );
          expectProblem(response, NOT_FOUND);
        }

        expect(await namesIn('root', owner.accessToken)).toEqual([
          'Fotos',
          'relatorio.txt',
        ]);
      },
    );

    it(
      'responde not_found ao Item que não é ativo e do Usuário',
      { tags: ['@LUI-181-CA6'] },
      async () => {
        const owner = await signedInUser();
        const other = await signedInUser();
        const [target] = await items.seed(owner.userId, owner.rootId, [
          { name: 'Destino', type: 'folder' },
        ]);
        const [othersFile] = await items.seed(other.userId, other.rootId, [
          { name: 'de-outro.txt' },
        ]);
        const [pending] = await items.seed(owner.userId, owner.rootId, [
          { name: 'pendente.txt', status: 'pending' },
        ]);

        for (const id of [othersFile, pending]) {
          const response = await items.move(id, owner.accessToken, target);
          expectProblem(response, NOT_FOUND);
        }

        expect(await namesIn('root', other.accessToken)).toEqual([
          'de-outro.txt',
        ]);
        expect(await namesIn(target, owner.accessToken)).toEqual([]);
      },
    );

    it(
      'responde unauthenticated sem o token',
      { tags: ['@LUI-181-CA6'] },
      async () => {
        const { userId, rootId } = await signedInUser();
        const [fileId, folderId] = await items.seed(userId, rootId, [
          { name: 'relatorio.txt' },
          { name: 'Destino', type: 'folder' },
        ]);

        const response = await items.move(fileId, undefined, folderId);

        expect(response.status).toBe(401);
        expect((response.body as { code: string }).code).toBe(
          'unauthenticated',
        );
      },
    );

    it(
      'aceita só um de dois movimentos simultâneos que criariam um ciclo',
      { tags: ['@LUI-181-CA7'] },
      async () => {
        const { accessToken, userId, rootId } = await signedInUser();
        const [a, b] = await items.seed(userId, rootId, [
          { name: 'A', type: 'folder' },
          { name: 'B', type: 'folder' },
        ]);

        const [intoB, intoA] = await Promise.all([
          items.move(a, accessToken, b),
          items.move(b, accessToken, a),
        ]);

        expect([intoB.status, intoA.status].sort((a, b) => a - b)).toEqual([
          200, 400,
        ]);
        const rejected = intoB.status === 400 ? intoB : intoA;
        expectProblem(rejected, INVALID_MOVE);
        for (const id of [a, b]) {
          const detail = await items.get(id, accessToken).expect(200);
          const trail = (detail.body as { trail: { name: string }[] }).trail;
          expect(trail[0].name).toBe('Meus arquivos');
          expect(trail.length).toBeLessThanOrEqual(3);
        }
      },
    );
  });
});
