import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { storageConfig } from '../src/config/storage.config.js';
import { authRoutes } from './support/auth-routes.js';
import { createTestApp } from './support/create-test-app.js';
import { itemRoutes } from './support/items.js';
import { uniqueEmail } from './support/mailpit.js';
import { expectProblem } from './support/problem.js';
import { getSignedUrlOnEmulator } from './support/storage-emulator.js';
import { uploadRoutes } from './support/uploads.js';

describe('URL de download de um arquivo', () => {
  let app: INestApplication<App>;
  let auth: ReturnType<typeof authRoutes>;
  let items: ReturnType<typeof itemRoutes>;
  let uploads: ReturnType<typeof uploadRoutes>;
  let emulatorHost: string | undefined;

  beforeAll(async () => {
    app = await createTestApp();
    auth = authRoutes(app);
    items = itemRoutes(app);
    uploads = uploadRoutes(app);
    emulatorHost = app.get<{ emulatorHost?: string }>(
      storageConfig.KEY,
    ).emulatorHost;
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

  /** Um arquivo ativo na Pasta raiz, enviado pelo caminho real, com os bytes dados. */
  const activeFile = async (
    accessToken: string,
    name: string,
    content: string,
  ) => {
    const { itemId, uploadUrl } = await uploads.start(accessToken, {
      name,
      sizeBytes: Buffer.byteLength(content),
    });
    await uploads.putBytes(uploadUrl, content);
    await uploads.complete(accessToken, itemId).expect(200);
    return itemId;
  };

  it('devolve a URL assinada de um arquivo ativo, que entrega os bytes, com validade de 5 minutos @LUI-168-CA1', async () => {
    const { accessToken } = await signedInUser();
    const itemId = await activeFile(accessToken, 'ola.txt', 'ola!!');
    const requestedAt = Date.now();

    const response = await items.downloadUrl(itemId, accessToken);
    const { url, expiresAt } = response.body as {
      url: string;
      expiresAt: string;
    };
    const delivered = await getSignedUrlOnEmulator(emulatorHost, url);

    expect(response.status).toBe(200);
    expect(
      Math.abs(Date.parse(expiresAt) - requestedAt - 5 * 60 * 1000),
    ).toBeLessThan(10_000);
    expect(new URL(url).origin).toBe(
      app.get<{ publicUrl: string }>(storageConfig.KEY).publicUrl,
    );
    expect(new URL(url).searchParams.get('X-Goog-Expires')).toBe('300');
    expect(delivered.status).toBe(200);
    expect(delivered.body.toString()).toBe('ola!!');
  });

  it('leva o nome original, com acento e espaço, no Content-Disposition como anexo @LUI-168-CA2', async () => {
    const { accessToken } = await signedInUser();
    const itemId = await activeFile(accessToken, 'relatório do mês.pdf', 'pdf');
    const objectKey = await uploads.objectKeyOf(itemId);
    const disposition =
      "attachment; filename*=UTF-8''relat%C3%B3rio%20do%20m%C3%AAs.pdf";

    const response = await items.downloadUrl(itemId, accessToken);
    const { url } = response.body as { url: string };
    const delivered = await getSignedUrlOnEmulator(emulatorHost, url);

    expect(delivered.headers['content-disposition']).toBe(disposition);
    expect(new URL(url).searchParams.get('response-content-disposition')).toBe(
      disposition,
    );
    expect(
      new URL(url).searchParams.get('response-content-disposition'),
    ).not.toContain(objectKey);
    expect(delivered.headers['content-disposition']).not.toContain(objectKey);
  });

  it('responde not_found para pasta, item pendente, item de outro Usuário e item inexistente @LUI-168-CA3', async () => {
    const owner = await signedInUser();
    const other = await signedInUser();
    const rootId = await items.rootId(owner.accessToken, owner.userId);
    const [folderId] = await items.seed(owner.userId, rootId, [
      { name: 'Pasta', type: 'folder' },
    ]);
    const { itemId: pendingId } = await uploads.start(owner.accessToken, {
      name: 'pendente.txt',
      sizeBytes: 5,
    });
    const activeId = await activeFile(owner.accessToken, 'ativo.txt', 'ola!!');
    const othersId = await activeFile(other.accessToken, 'dele.txt', 'ola!!');
    const notFound = {
      title: 'Not Found',
      status: 404,
      code: 'not_found',
      detail: expect.any(String),
    };

    const folder = await items.downloadUrl(folderId, owner.accessToken);
    const pending = await items.downloadUrl(pendingId, owner.accessToken);
    const others = await items.downloadUrl(othersId, owner.accessToken);
    const missing = await items.downloadUrl(
      '0198f5a0-0000-7000-8000-000000000000',
      owner.accessToken,
    );
    const notUuid = await items.downloadUrl('nao-e-uuid', owner.accessToken);
    const own = await items.downloadUrl(activeId, owner.accessToken);
    const anonymous = await items.downloadUrl(activeId);

    for (const response of [folder, pending, others, missing, notUuid]) {
      expectProblem(response, notFound);
    }
    expect(own.status).toBe(200);
    expectProblem(anonymous, {
      title: 'Unauthorized',
      status: 401,
      code: 'unauthenticated',
      detail: expect.any(String),
    });
  });
});
