import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { v7 as uuidv7 } from 'uuid';
import { authRoutes } from './support/auth-routes.js';
import { createTestApp } from './support/create-test-app.js';
import { itemRoutes } from './support/items.js';
import { uniqueEmail } from './support/mailpit.js';
import { expectProblem, expectValidationError } from './support/problem.js';

describe('Lista da Pasta raiz', () => {
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

  /** Um Usuário verificado, com Sessão, e o id dele. */
  const signedInUser = async () => {
    const { accessToken } = await auth.openSession(uniqueEmail());
    const { body } = await auth.me(accessToken).expect(200);
    return { accessToken, userId: (body as { id: string }).id };
  };

  it(
    'responde a lista vazia, sem a própria raiz, para um Usuário novo',
    { tags: ['@LUI-166-CA1'] },
    async () => {
      const { accessToken } = await signedInUser();

      const response = await items
        .listChildren('root', accessToken)
        .expect(200);

      expect(response.body).toEqual({ items: [], nextCursor: null });
    },
  );

  it(
    'responde 200 a todas as chamadas simultâneas no primeiro uso da raiz',
    { tags: ['@LUI-166-CA2'] },
    async () => {
      const { accessToken } = await signedInUser();

      const responses = await Promise.all(
        Array.from({ length: 10 }, () =>
          items.listChildren('root', accessToken),
        ),
      );

      for (const response of responses) {
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ items: [], nextCursor: null });
      }
    },
  );

  it(
    'traz só os Itens ativos da raiz do Usuário, pastas primeiro e depois por nome',
    { tags: ['@LUI-166-CA3'] },
    async () => {
      const owner = await signedInUser();
      const ownerRoot = await items.rootId(owner.accessToken, owner.userId);
      const updatedAt = new Date('2026-03-01T12:30:00.000Z');
      const [bFolder, aFolder, cFile, aFile] = await items.seed(
        owner.userId,
        ownerRoot,
        [
          { name: 'b-pasta', type: 'folder' },
          { name: 'a-pasta', type: 'folder' },
          { name: 'c.txt', sizeBytes: 300, mimeType: 'text/plain', updatedAt },
          {
            name: 'a.txt',
            sizeBytes: 5 * 1024 ** 3,
            mimeType: 'text/plain',
            updatedAt,
          },
          { name: 'pendente.txt', status: 'pending' },
          { name: 'na-lixeira.txt', status: 'trashed' },
        ],
      );
      await items.seed(owner.userId, aFolder, [{ name: 'dentro.txt' }]);
      const other = await signedInUser();
      await items.seed(
        other.userId,
        await items.rootId(other.accessToken, other.userId),
        [{ name: 'de-outro.txt' }],
      );

      const response = await items
        .listChildren('root', owner.accessToken)
        .expect(200);

      expect(response.body).toEqual({
        items: [
          {
            id: aFolder,
            type: 'folder',
            name: 'a-pasta',
            sizeBytes: 0,
            mimeType: null,
            updatedAt: expect.any(String),
          },
          {
            id: bFolder,
            type: 'folder',
            name: 'b-pasta',
            sizeBytes: 0,
            mimeType: null,
            updatedAt: expect.any(String),
          },
          {
            id: aFile,
            type: 'file',
            name: 'a.txt',
            sizeBytes: 5368709120,
            mimeType: 'text/plain',
            updatedAt: '2026-03-01T12:30:00.000Z',
          },
          {
            id: cFile,
            type: 'file',
            name: 'c.txt',
            sizeBytes: 300,
            mimeType: 'text/plain',
            updatedAt: '2026-03-01T12:30:00.000Z',
          },
        ],
        nextCursor: null,
      });
    },
  );

  it(
    'pagina por cursor sem repetir nem pular Itens, mesmo com nomes iguais',
    { tags: ['@LUI-166-CA4'] },
    async () => {
      const { accessToken, userId } = await signedInUser();
      await items.seed(userId, await items.rootId(accessToken, userId), [
        { name: 'igual.txt' },
        { name: 'b.txt' },
        { name: 'igual.txt' },
        { name: 'a.txt' },
        { name: 'igual.txt' },
      ]);
      const { body: unpaged } = await items
        .listChildren('root', accessToken)
        .expect(200);

      const pages: { items: { id: string }[]; nextCursor: string | null }[] =
        [];
      let cursor: string | null = null;
      do {
        const query: Record<string, string | number> = { limit: 2 };
        if (cursor) {
          query.cursor = cursor;
        }
        const { body } = await items
          .listChildren('root', accessToken, query)
          .expect(200);
        pages.push(body);
        cursor = (body as { nextCursor: string | null }).nextCursor;
      } while (cursor && pages.length < 10);

      expect(pages.map((page) => page.items.length)).toEqual([2, 2, 1]);
      expect(pages.map((page) => page.nextCursor === null)).toEqual([
        false,
        false,
        true,
      ]);
      expect(pages.flatMap((page) => page.items)).toEqual(
        (unpaged as { items: unknown[] }).items,
      );
    },
  );

  it(
    'usa 50 Itens por página por padrão, aceita até 200 e recusa um limit acima do máximo',
    { tags: ['@LUI-166-CA4'] },
    async () => {
      const { accessToken, userId } = await signedInUser();
      await items.seed(
        userId,
        await items.rootId(accessToken, userId),
        Array.from({ length: 201 }, (_, index) => ({
          name: `arquivo-${String(index).padStart(3, '0')}.txt`,
        })),
      );

      const [byDefault, atMaximum, aboveMaximum] = await Promise.all([
        items.listChildren('root', accessToken),
        items.listChildren('root', accessToken, { limit: 200 }),
        items.listChildren('root', accessToken, { limit: 201 }),
      ]);

      expect(byDefault.status).toBe(200);
      expect(byDefault.body.items).toHaveLength(50);
      expect(byDefault.body.nextCursor).toEqual(expect.any(String));
      expect(atMaximum.status).toBe(200);
      expect(atMaximum.body.items).toHaveLength(200);
      expect(atMaximum.body.nextCursor).toEqual(expect.any(String));
      expectValidationError(aboveMaximum, 'limit');
    },
  );

  it(
    'responde unauthenticated sem token de acesso',
    { tags: ['@LUI-166-CA5'] },
    async () => {
      const response = await items.listChildren('root').expect(401);

      expectProblem(response, {
        title: 'Unauthorized',
        status: 401,
        code: 'unauthenticated',
        detail: expect.any(String),
      });
    },
  );

  it('responde not_found para um id que não é de uma pasta ativa do Usuário', async () => {
    const { accessToken } = await signedInUser();

    const response = await items
      .listChildren(uuidv7(), accessToken)
      .expect(404);

    expectProblem(response, {
      title: 'Not Found',
      status: 404,
      code: 'not_found',
      detail: expect.any(String),
    });
  });

  it('recusa um cursor ilegível com validation_error', async () => {
    const { accessToken } = await signedInUser();

    const response = await items
      .listChildren('root', accessToken, { cursor: 'nao-e-um-cursor' })
      .expect(400);

    expectValidationError(response, 'cursor');
  });

  it('recusa um cursor vazio com validation_error, em vez de devolver a primeira página', async () => {
    const { accessToken } = await signedInUser();

    const response = await items
      .listChildren('root', accessToken, { cursor: '' })
      .expect(400);

    expectValidationError(response, 'cursor');
  });
});
