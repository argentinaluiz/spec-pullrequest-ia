import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { storageConfig } from '../src/config/storage.config.js';
import { PrismaService } from '../src/infra/database/prisma.service.js';
import {
  FILE_STORAGE,
  type FileStorage,
} from '../src/infra/storage/file-storage.js';
import { authRoutes } from './support/auth-routes.js';
import { createTestApp } from './support/create-test-app.js';
import { itemRoutes } from './support/items.js';
import { uniqueEmail } from './support/mailpit.js';
import { expectProblem } from './support/problem.js';
import {
  type StorageProxy,
  startStorageProxy,
} from './support/storage-proxy.js';
import { uploadRoutes } from './support/uploads.js';
import { ItemsService } from '../src/modules/items/items.service.js';
import { UploadsService } from '../src/modules/uploads/uploads.service.js';

/** Um Usuário verificado, com Sessão, e o id dele. */
async function signedInUser(app: INestApplication<App>) {
  const { accessToken } = await authRoutes(app).openSession(uniqueEmail());
  const { body } = await authRoutes(app).me(accessToken).expect(200);
  return { accessToken, userId: (body as { id: string }).id };
}

const cleanup = (app: INestApplication<App>) =>
  app.get(UploadsService).cleanupPending();

describe('Limpeza dos uploads pendentes', () => {
  // Prazo zero: todo pendente já venceu.
  let app: INestApplication<App>;

  beforeAll(async () => {
    vi.stubEnv('PENDING_UPLOAD_TTL_HOURS', '0');
    app = await createTestApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  const signedIn = () => signedInUser(app);
  const uploads = () => uploadRoutes(app);
  const storage = () => app.get<FileStorage>(FILE_STORAGE);
  const createNineBytes = (accessToken: string) =>
    uploads().create(accessToken, {
      name: 'cabe-depois.txt',
      sizeBytes: 9,
      parentId: 'root',
    });

  it('remove os uploads pendentes vencidos e devolve o espaço reservado à Cota @LUI-169-CA1', async () => {
    const { accessToken, userId } = await signedIn();
    await uploads().leaveFreeBytes(userId, 10);
    const usedBefore = await uploads().usedBytes(userId);
    const empty = await uploads().start(accessToken, {
      name: 'sem-bytes.txt',
      sizeBytes: 4,
    });
    const sent = await uploads().start(accessToken, {
      name: 'com-bytes.txt',
      sizeBytes: 5,
    });
    await uploads().putBytes(sent.uploadUrl, 'abcde');
    const sentKey = await uploads().objectKeyOf(sent.itemId);
    const beforeCleanup = await createNineBytes(accessToken);

    await cleanup(app);

    const remaining = await app.get(PrismaService).item.count({
      where: { id: { in: [empty.itemId, sent.itemId] } },
    });
    const usedAfter = await uploads().usedBytes(userId);
    const afterCleanup = await createNineBytes(accessToken);
    expectProblem(beforeCleanup, {
      title: 'Payload Too Large',
      status: 413,
      code: 'quota_exceeded',
      detail: expect.any(String),
    });
    expect(remaining).toBe(0);
    expect(await storage().getObjectSize(sentKey)).toBeNull();
    expect((await uploads().putBytes(sent.uploadUrl, 'abcde')).ok).toBe(false);
    expect(usedAfter).toBe(usedBefore);
    expect(afterCleanup.status).toBe(201);
  });

  it('nunca remove um arquivo ativo, por mais antigo que seja @LUI-169-CA3', async () => {
    const { accessToken, userId } = await signedIn();
    const { itemId, uploadUrl } = await uploads().start(accessToken, {
      name: 'antigo.txt',
      sizeBytes: 5,
    });
    await uploads().putBytes(uploadUrl, 'abcde');
    await uploads().complete(accessToken, itemId).expect(200);
    await app.get(PrismaService).item.update({
      where: { id: itemId },
      data: { createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    });
    const usedBefore = await uploads().usedBytes(userId);

    await cleanup(app);

    const listed = await itemRoutes(app)
      .listChildren('root', accessToken)
      .expect(200);
    const download = await itemRoutes(app).downloadUrl(itemId, accessToken);
    expect(
      (listed.body as { items: { id: string }[] }).items.map((i) => i.id),
    ).toContain(itemId);
    expect(download.status).toBe(200);
    expect(await uploads().usedBytes(userId)).toBe(usedBefore);
  });

  it('devolve o espaço uma vez só quando a limpeza roda duas vezes @LUI-169-CA4', async () => {
    const { accessToken, userId } = await signedIn();
    await uploads().leaveFreeBytes(userId, 100);
    const usedBefore = await uploads().usedBytes(userId);
    await uploads().start(accessToken, { name: 'p.txt', sizeBytes: 7 });
    expect(await uploads().usedBytes(userId)).toBe(usedBefore + 7);

    const first = await cleanup(app);
    const usedAfterFirst = await uploads().usedBytes(userId);
    const second = await cleanup(app);

    expect(first.removed).toBeGreaterThanOrEqual(1);
    expect(first.failed).toBe(0);
    expect(usedAfterFirst).toBe(usedBefore);
    expect(second).toEqual({ removed: 0, failed: 0 });
    expect(await uploads().usedBytes(userId)).toBe(usedBefore);
  });

  it('o upload removido pela limpeza responde not_found na conclusão @LUI-169-CA5', async () => {
    const { accessToken } = await signedIn();
    const { itemId, uploadUrl } = await uploads().start(accessToken, {
      name: 'removido.txt',
      sizeBytes: 5,
    });
    await uploads().putBytes(uploadUrl, 'abcde');

    await cleanup(app);

    expectProblem(await uploads().complete(accessToken, itemId), {
      title: 'Not Found',
      status: 404,
      code: 'not_found',
      detail: expect.any(String),
    });
  });

  it('não toca no upload concluído entre a listagem e o expurgo', async () => {
    const { accessToken, userId } = await signedIn();
    const { itemId, uploadUrl } = await uploads().start(accessToken, {
      name: 'concluido-no-meio.txt',
      sizeBytes: 5,
    });
    await uploads().putBytes(uploadUrl, 'abcde');
    const objectKey = await uploads().objectKeyOf(itemId);
    const items = app.get(ItemsService);
    const listPurgeableUploads = items.listPurgeableUploads.bind(items);
    vi.spyOn(items, 'listPurgeableUploads').mockImplementation(
      async (...args) => {
        const listed = await listPurgeableUploads(...args);
        await items.activatePending(itemId);
        return listed;
      },
    );

    const result = await cleanup(app);

    const item = await app
      .get(PrismaService)
      .item.findUniqueOrThrow({ where: { id: itemId } });
    expect(result.removed).toBe(0);
    expect(item.status).toBe('active');
    expect(await storage().getObjectSize(objectKey)).toBe(5);
    expect(await uploads().usedBytes(userId)).toBe(5);
  });
});

describe('Limpeza dos uploads pendentes, com o prazo padrão', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const itemOf = (id: string) =>
    app.get(PrismaService).item.findUniqueOrThrow({ where: { id } });

  it('mantém o upload pendente dentro do prazo, que ainda pode ser concluído @LUI-169-CA2', async () => {
    const { accessToken, userId } = await signedInUser(app);
    const routes = uploadRoutes(app);
    const { itemId, uploadUrl } = await routes.start(accessToken, {
      name: 'recente.txt',
      sizeBytes: 5,
    });

    await cleanup(app);

    const item = await itemOf(itemId);
    const used = await routes.usedBytes(userId);
    await routes.putBytes(uploadUrl, 'abcde');
    const completed = await routes.complete(accessToken, itemId);
    expect(item.status).toBe('pending');
    expect(used).toBe(5);
    expect(completed.status).toBe(200);
    expect((completed.body as { id: string }).id).toBe(itemId);
    expect(await itemOf(itemId)).toMatchObject({ status: 'active' });
  });
});

// Por último no arquivo: o Vitest desfaz o `vi.stubEnv` de um `beforeEach` só antes do próximo
// teste, e o `beforeAll` de um `describe` seguinte criaria a aplicação com o endereço do proxy.
describe('Limpeza dos uploads, com o storage atrás de um proxy que recusa um pedido', () => {
  // A aplicação direta tem o prazo padrão; a do proxy, o prazo zero.
  let direct: INestApplication<App>;
  let proxy: StorageProxy;
  let viaProxy: INestApplication<App>;

  beforeAll(async () => {
    direct = await createTestApp();
  });

  afterAll(async () => {
    await direct.close();
  });

  beforeEach(async () => {
    proxy = await startStorageProxy(direct.get(storageConfig.KEY).emulatorHost);
    vi.stubEnv('PENDING_UPLOAD_TTL_HOURS', '0');
    vi.stubEnv('STORAGE_EMULATOR_HOST', proxy.url);
    viaProxy = await createTestApp();
  });

  afterEach(async () => {
    await viaProxy.close().catch(() => undefined);
    await proxy.close();
  });

  it('com o storage fora do ar, conta a falha e deixa o upload em remoção, com o objeto e a Cota já devolvida', async () => {
    // Os uploads de antes saem primeiro: as falhas pedidas ao proxy ficam com o deste teste.
    await cleanup(viaProxy);
    const { accessToken, userId } = await signedInUser(direct);
    const routes = uploadRoutes(direct);
    const pending = await routes.start(accessToken, {
      name: 'storage-fora.txt',
      sizeBytes: 5,
    });
    const objectKey = await routes.storeObject(pending, 'abcde');
    proxy.failNext('DELETE');
    proxy.failNext('DELETE');

    const result = await cleanup(viaProxy);

    expect(result).toEqual({ removed: 0, failed: 1 });
    expect(await routes.itemStatus(pending.itemId)).toBe('deleting');
    expect(await routes.objectStatus(objectKey)).toBe(200);
    expect(await routes.usedBytes(userId)).toBe(0);
  });

  it('conta um 4xx no cancelamento da sessão como sessão já encerrada e remove o upload', async () => {
    await cleanup(viaProxy);
    const { accessToken, userId } = await signedInUser(direct);
    const routes = uploadRoutes(direct);
    const pending = await routes.start(accessToken, {
      name: 'sessao-finalizada.txt',
      sizeBytes: 5,
    });
    const objectKey = await routes.storeObject(pending, 'abcde');
    proxy.failNext('DELETE', 400);

    const result = await cleanup(viaProxy);

    expect(result).toEqual({ removed: 1, failed: 0 });
    expect(await routes.itemStatus(pending.itemId)).toBeNull();
    expect(await routes.objectStatus(objectKey)).toBe(404);
    expect(await routes.usedBytes(userId)).toBe(0);
  });

  /**
   * Um Usuário com um upload de 10 bytes em remoção: o cancelamento o tomou e
   * devolveu a Cota, mas o storage recusou as duas remoções. `usedBefore` é a
   * Cota de antes do envio. `beforeClaim` roda com o upload ainda pendente.
   */
  const deletingUpload = async (
    beforeClaim: (itemId: string) => Promise<void> = async () => undefined,
  ) => {
    const { accessToken, userId } = await signedInUser(direct);
    const routes = uploadRoutes(direct);
    await routes.leaveFreeBytes(userId, 20);
    const usedBefore = await routes.usedBytes(userId);
    const pending = await routes.start(accessToken, {
      name: 'em-remocao.txt',
      sizeBytes: 10,
    });
    const objectKey = await routes.storeObject(pending, '0123456789');
    await beforeClaim(pending.itemId);
    proxy.failNext('DELETE');
    proxy.failNext('DELETE');
    await uploadRoutes(viaProxy)
      .cancel(accessToken, pending.itemId)
      .expect(500);
    return {
      routes,
      accessToken,
      userId,
      usedBefore,
      itemId: pending.itemId,
      objectKey,
    };
  };

  it('termina o upload que ficou em remoção há mais de 15 minutos, mesmo dentro do prazo, sem devolver a Cota outra vez', async () => {
    const { routes, userId, usedBefore, itemId, objectKey } =
      await deletingUpload();
    await routes.updatedMinutesAgo(itemId, 16);

    const result = await cleanup(direct);

    expect(result.removed).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBe(0);
    expect(await routes.itemStatus(itemId)).toBeNull();
    expect(await routes.objectStatus(objectKey)).toBe(404);
    expect(await routes.usedBytes(userId)).toBe(usedBefore);
  });

  it('não conta o upload em remoção que outro expurgo terminou enquanto esta limpeza limpava o storage', async () => {
    await cleanup(viaProxy);
    const { routes, accessToken, itemId } = await deletingUpload();
    await routes.updatedMinutesAgo(itemId, 16);
    // A limpeza já leu o upload em remoção e fica parada no cancelamento da sessão.
    const storageCall = proxy.holdNext('DELETE');
    const cleaning = cleanup(viaProxy);
    await storageCall.reached;
    await routes.cancel(accessToken, itemId).expect(204);

    storageCall.release();
    const result = await cleaning;

    expect(result).toEqual({ removed: 0, failed: 0 });
    expect(await routes.itemStatus(itemId)).toBeNull();
  });

  it('não toca no upload tomado pelo expurgo há menos de 15 minutos, que pode ainda estar em remoção, contados da tomada', async () => {
    // Gravado pela última vez há uma hora, e tomado agora.
    const { routes, userId, usedBefore, itemId, objectKey } =
      await deletingUpload((id) =>
        uploadRoutes(direct).updatedMinutesAgo(id, 60),
      );

    await cleanup(direct);

    expect(await routes.itemStatus(itemId)).toBe('deleting');
    expect(await routes.objectStatus(objectKey)).toBe(200);
    expect(await routes.usedBytes(userId)).toBe(usedBefore);
  });
});
