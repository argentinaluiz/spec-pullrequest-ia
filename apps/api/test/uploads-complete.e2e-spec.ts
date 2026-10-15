import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { v7 as uuidv7 } from 'uuid';
import { authRoutes } from './support/auth-routes.js';
import { createTestApp } from './support/create-test-app.js';
import { itemRoutes } from './support/items.js';
import { NOT_FOUND, expectProblem } from './support/problem.js';
import { uploadRoutes } from './support/uploads.js';

describe('Conclusão do envio de um arquivo', () => {
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

  it(
    'recusa a conclusão com tamanho diferente, apaga o objeto e devolve o espaço',
    { tags: ['@LUI-167-CA6'] },
    async () => {
      const { accessToken, userId } = await auth.signedInUser();
      await uploads.leaveFreeBytes(userId, 10);
      const { itemId, uploadUrl } = await uploads.start(accessToken, {
        name: 'curto.txt',
        sizeBytes: 10,
      });
      const objectKey = await uploads.objectKeyOf(itemId);
      await uploads.putBytes(uploadUrl, 'abcd');

      const response = await uploads.complete(accessToken, itemId);
      const objectAfter = await uploads.objectStatus(objectKey);
      const retry = await uploads.create(accessToken, {
        name: 'de-novo.txt',
        sizeBytes: 10,
        parentId: 'root',
      });
      const completeAgain = await uploads.complete(accessToken, itemId);

      expectProblem(response, {
        title: 'Conflict',
        status: 409,
        code: 'upload_size_mismatch',
        detail: expect.any(String),
      });
      expect(objectAfter).toBe(404);
      expect(retry.status).toBe(201);
      expectProblem(completeAgain, NOT_FOUND);
    },
  );

  it(
    'responde upload_incomplete antes de o objeto chegar e conclui depois do envio completo',
    { tags: ['@LUI-167-CA7'] },
    async () => {
      const { accessToken } = await auth.signedInUser();
      const { itemId, uploadUrl } = await uploads.start(accessToken, {
        name: 'ola.txt',
        sizeBytes: 5,
      });

      const early = await uploads.complete(accessToken, itemId);
      const listedEarly = await items.listChildren('root', accessToken);
      await uploads.putBytes(uploadUrl, 'ola!!');
      const late = await uploads.complete(accessToken, itemId);
      const listedLate = await items.listChildren('root', accessToken);

      expectProblem(early, {
        title: 'Conflict',
        status: 409,
        code: 'upload_incomplete',
        detail: expect.any(String),
      });
      expect(listedEarly.body).toEqual({ items: [], nextCursor: null });
      expect(late.status).toBe(200);
      expect((late.body as { id: string }).id).toBe(itemId);
      expect((listedLate.body as { items: { id: string }[] }).items).toEqual([
        expect.objectContaining({ id: itemId }),
      ]);
    },
  );

  it(
    'devolve o mesmo Item ativo na conclusão repetida, sem reservar espaço de novo',
    { tags: ['@LUI-167-CA8'] },
    async () => {
      const { accessToken, userId } = await auth.signedInUser();
      await uploads.leaveFreeBytes(userId, 20);
      const { itemId, uploadUrl } = await uploads.start(accessToken, {
        name: 'dez.txt',
        sizeBytes: 10,
      });
      await uploads.putBytes(uploadUrl, '0123456789');
      const first = await uploads.complete(accessToken, itemId).expect(200);

      const second = await uploads.complete(accessToken, itemId);
      const listed = await items.listChildren('root', accessToken);
      const another = await uploads.create(accessToken, {
        name: 'outro.txt',
        sizeBytes: 10,
        parentId: 'root',
      });

      expect(second.status).toBe(200);
      expect(second.body).toEqual(first.body);
      expect((listed.body as { items: unknown[] }).items).toEqual([first.body]);
      expect(another.status).toBe(201);
    },
  );

  it(
    'devolve o mesmo Item nas conclusões simultâneas do mesmo upload',
    { tags: ['@LUI-167-CA8'] },
    async () => {
      const { accessToken } = await auth.signedInUser();
      const { itemId, uploadUrl } = await uploads.start(accessToken, {
        name: 'dez.txt',
        sizeBytes: 10,
      });
      await uploads.putBytes(uploadUrl, '0123456789');

      const [one, two] = await Promise.all([
        uploads.complete(accessToken, itemId),
        uploads.complete(accessToken, itemId),
      ]);

      expect(one.status).toBe(200);
      expect(two.status).toBe(200);
      expect(two.body).toEqual(one.body);
    },
  );

  it(
    'envia e conclui um arquivo de 0 bytes, com o tipo padrão',
    { tags: ['@LUI-167-CA9'] },
    async () => {
      const { accessToken } = await auth.signedInUser();
      const { body } = await uploads
        .create(accessToken, { name: 'vazio', sizeBytes: 0, parentId: 'root' })
        .expect(201);
      const { itemId, uploadUrl } = body as {
        itemId: string;
        uploadUrl: string;
      };
      const sent = await uploads.putBytes(uploadUrl);

      const completed = await uploads.complete(accessToken, itemId);
      const listed = await items.listChildren('root', accessToken);

      expect(sent.status).toBe(200);
      expect(completed.status).toBe(200);
      expect(completed.body).toEqual({
        id: itemId,
        type: 'file',
        name: 'vazio',
        sizeBytes: 0,
        mimeType: 'application/octet-stream',
        updatedAt: expect.any(String),
      });
      expect((listed.body as { items: unknown[] }).items).toEqual([
        completed.body,
      ]);
    },
  );

  it(
    'responde not_found à conclusão do upload de outro Usuário',
    { tags: ['@LUI-167-CA10'] },
    async () => {
      const owner = await auth.signedInUser();
      const stranger = await auth.signedInUser();
      const { itemId, uploadUrl } = await uploads.start(owner.accessToken, {
        name: 'meu.txt',
        sizeBytes: 5,
      });
      await uploads.putBytes(uploadUrl, 'ola!!');

      const byStranger = await uploads.complete(stranger.accessToken, itemId);
      const unknown = await uploads.complete(stranger.accessToken, uuidv7());
      const byOwner = await uploads.complete(owner.accessToken, itemId);

      expectProblem(byStranger, NOT_FOUND);
      expect(byStranger.body).toEqual(unknown.body);
      expect(byOwner.status).toBe(200);
    },
  );
});
