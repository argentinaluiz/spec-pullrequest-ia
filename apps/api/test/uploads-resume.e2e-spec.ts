import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { v7 as uuidv7 } from 'uuid';
import { authRoutes } from './support/auth-routes.js';
import { createTestApp } from './support/create-test-app.js';
import { NOT_FOUND, expectProblem } from './support/problem.js';
import { uploadRoutes } from './support/uploads.js';

describe('Retomada do envio de um arquivo', () => {
  let app: INestApplication<App>;
  let auth: ReturnType<typeof authRoutes>;
  let uploads: ReturnType<typeof uploadRoutes>;

  beforeAll(async () => {
    app = await createTestApp();
    auth = authRoutes(app);
    uploads = uploadRoutes(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it(
    'devolve a sessão de um upload pendente',
    { tags: ['@LUI-171-CA1'] },
    async () => {
      const { accessToken } = await auth.signedInUser();
      const created = await uploads.start(accessToken, {
        name: 'retomado.txt',
        sizeBytes: 5,
      });

      const resumed = await uploads.resume(accessToken, created.itemId);

      expect(resumed.status).toBe(200);
      expect(resumed.body).toEqual({
        itemId: created.itemId,
        uploadUrl: created.uploadUrl,
        expiresAt: created.expiresAt,
      });
    },
  );

  it(
    'não devolve a sessão de um upload concluído',
    { tags: ['@LUI-171-CA2'] },
    async () => {
      const { accessToken } = await auth.signedInUser();
      const created = await uploads.start(accessToken, {
        name: 'concluido.txt',
        sizeBytes: 5,
      });
      await uploads.putBytes(created.uploadUrl, 'abcde');
      await uploads.complete(accessToken, created.itemId).expect(200);

      const resumed = await uploads.resume(accessToken, created.itemId);

      expectProblem(resumed, NOT_FOUND);
      expect(JSON.stringify(resumed.body)).not.toContain('uploadUrl');
    },
  );

  it(
    'não devolve a sessão de um upload cancelado',
    { tags: ['@LUI-171-CA2'] },
    async () => {
      const { accessToken } = await auth.signedInUser();
      const created = await uploads.start(accessToken, {
        name: 'cancelado.txt',
        sizeBytes: 5,
      });
      await uploads.cancel(accessToken, created.itemId).expect(204);

      const resumed = await uploads.resume(accessToken, created.itemId);

      expectProblem(resumed, NOT_FOUND);
      expect(JSON.stringify(resumed.body)).not.toContain('uploadUrl');
    },
  );

  it(
    'não devolve a sessão do upload pendente de outro Usuário',
    { tags: ['@LUI-171-CA2'] },
    async () => {
      const owner = await auth.signedInUser();
      const other = await auth.signedInUser();
      const created = await uploads.start(owner.accessToken, {
        name: 'alheio.txt',
        sizeBytes: 5,
      });

      const resumed = await uploads.resume(other.accessToken, created.itemId);

      expectProblem(resumed, NOT_FOUND);
      expect(JSON.stringify(resumed.body)).not.toContain('uploadUrl');
    },
  );

  it(
    'não devolve a sessão de um UUID que não existe',
    { tags: ['@LUI-171-CA2'] },
    async () => {
      const { accessToken } = await auth.signedInUser();

      const resumed = await uploads.resume(accessToken, uuidv7());

      expectProblem(resumed, NOT_FOUND);
      expect(JSON.stringify(resumed.body)).not.toContain('uploadUrl');
    },
  );

  it(
    'não devolve a sessão de um id que não é UUID',
    { tags: ['@LUI-171-CA2'] },
    async () => {
      const { accessToken } = await auth.signedInUser();

      const resumed = await uploads.resume(accessToken, 'nao-e-uuid');

      expectProblem(resumed, NOT_FOUND);
      expect(JSON.stringify(resumed.body)).not.toContain('uploadUrl');
    },
  );
});

describe('Retomada de um upload com o prazo vencido', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Prazo zero: todo pendente já venceu, e a limpeza ainda não o removeu.
    vi.stubEnv('PENDING_UPLOAD_TTL_HOURS', '0');
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('não devolve a sessão de um upload pendente que já venceu, mesmo antes da limpeza', async () => {
    const { accessToken } = await authRoutes(app).signedInUser();
    const uploads = uploadRoutes(app);
    const created = await uploads.start(accessToken, {
      name: 'vencido.txt',
      sizeBytes: 5,
    });

    const resumed = await uploads.resume(accessToken, created.itemId);

    expectProblem(resumed, NOT_FOUND);
    expect(JSON.stringify(resumed.body)).not.toContain('uploadUrl');
  });
});
