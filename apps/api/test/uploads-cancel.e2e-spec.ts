import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { v7 as uuidv7 } from 'uuid';
import { storageConfig } from '../src/config/storage.config.js';
import { authRoutes } from './support/auth-routes.js';
import { createTestApp } from './support/create-test-app.js';
import { INTERNAL_ERROR, NOT_FOUND, expectProblem } from './support/problem.js';
import {
  type StorageProxy,
  startStorageProxy,
} from './support/storage-proxy.js';
import { uploadRoutes } from './support/uploads.js';

describe('Cancelamento do envio de um arquivo', () => {
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

  /**
   * Um Usuário com 20 bytes livres e um upload pendente de 10 bytes, com o
   * objeto já no emulador e a Cota reservada. `usedBefore` é a Cota de antes
   * do envio.
   */
  const pendingWithObject = async () => {
    const user = await auth.signedInUser();
    await uploads.leaveFreeBytes(user.userId, 20);
    const usedBefore = await uploads.usedBytes(user.userId);
    const pending = await uploads.start(user.accessToken, {
      name: 'cancelado.txt',
      sizeBytes: 10,
    });
    const objectKey = await uploads.storeObject(pending, '0123456789');
    return { user, usedBefore, pending, objectKey };
  };

  it('cancela o upload pendente com 204 sem corpo, devolve o espaço à Cota e apaga o objeto @LUI-170-CA8', async () => {
    const { user, usedBefore, pending, objectKey } = await pendingWithObject();

    const cancelled = await uploads.cancel(user.accessToken, pending.itemId);

    expect(cancelled.status).toBe(204);
    expect(cancelled.text).toBe('');
    expect(await uploads.usedBytes(user.userId)).toBe(usedBefore);
    expect(await uploads.objectStatus(objectKey)).toBe(404);
  });

  it('a conclusão de um upload cancelado responde not_found @LUI-170-CA8', async () => {
    const { user, pending } = await pendingWithObject();
    await uploads.cancel(user.accessToken, pending.itemId).expect(204);

    const completed = await uploads.complete(user.accessToken, pending.itemId);

    expectProblem(completed, NOT_FOUND);
  });

  it('cancelar de novo o mesmo upload responde not_found, sem devolver o espaço outra vez @LUI-170-CA8', async () => {
    const { user, usedBefore, pending } = await pendingWithObject();
    await uploads.cancel(user.accessToken, pending.itemId).expect(204);

    const again = await uploads.cancel(user.accessToken, pending.itemId);

    expectProblem(again, NOT_FOUND);
    expect(await uploads.usedBytes(user.userId)).toBe(usedBefore);
  });

  it('cancelar um arquivo ativo responde not_found e não muda a Cota nem o objeto @LUI-170-CA8', async () => {
    const { user, pending, objectKey } = await pendingWithObject();
    await uploads.complete(user.accessToken, pending.itemId).expect(200);
    const usedWithActive = await uploads.usedBytes(user.userId);

    const cancelled = await uploads.cancel(user.accessToken, pending.itemId);

    expectProblem(cancelled, NOT_FOUND);
    expect(await uploads.usedBytes(user.userId)).toBe(usedWithActive);
    expect(await uploads.objectStatus(objectKey)).toBe(200);
  });

  it('cancelar o upload pendente de outro Usuário responde not_found e não muda a Cota dele @LUI-170-CA8', async () => {
    const a = await auth.signedInUser();
    const b = await pendingWithObject();
    const usedByB = await uploads.usedBytes(b.user.userId);

    const cancelled = await uploads.cancel(a.accessToken, b.pending.itemId);

    expectProblem(cancelled, NOT_FOUND);
    expect(await uploads.usedBytes(b.user.userId)).toBe(usedByB);
    expect(await uploads.itemStatus(b.pending.itemId)).toBe('pending');
  });

  it.each([
    ['um id que não existe', uuidv7()],
    ['um id que não é UUID', 'nao-e-uuid'],
  ])('responde not_found a %s @LUI-170-CA8', async (_case, itemId) => {
    const user = await auth.signedInUser();

    const cancelled = await uploads.cancel(user.accessToken, itemId);

    expectProblem(cancelled, NOT_FOUND);
  });

  it('sem token, responde 401 unauthenticated @LUI-170-CA8', async () => {
    const { pending } = await pendingWithObject();

    const cancelled = await uploads.cancel(undefined, pending.itemId);

    expectProblem(cancelled, {
      title: 'Unauthorized',
      status: 401,
      code: 'unauthenticated',
      detail: expect.any(String),
    });
  });

  describe('com o storage atrás de um proxy que segura ou recusa um pedido', () => {
    // A mesma API, com o storage atrás do proxy.
    let proxy: StorageProxy;
    let viaProxy: INestApplication<App>;

    beforeEach(async () => {
      proxy = await startStorageProxy(app.get(storageConfig.KEY).emulatorHost);
      vi.stubEnv('STORAGE_EMULATOR_HOST', proxy.url);
      viaProxy = await createTestApp();
    });

    afterEach(async () => {
      await viaProxy.close().catch(() => undefined);
      await proxy.close();
    });

    it('a conclusão pedida depois que o cancelamento tomou o upload responde not_found, e nenhum Item fica ativo sem o objeto', async () => {
      const { user, usedBefore, pending, objectKey } =
        await pendingWithObject();
      // O cancelamento já tomou o upload e fica parado na primeira remoção do storage.
      const storageCall = proxy.holdNext('DELETE');
      const cancelling = uploadRoutes(viaProxy)
        .cancel(user.accessToken, pending.itemId)
        .then();
      await storageCall.reached;

      const completed = await uploads.complete(
        user.accessToken,
        pending.itemId,
      );

      storageCall.release();
      expectProblem(completed, NOT_FOUND);
      expect((await cancelling).status).toBe(204);
      expect(await uploads.itemStatus(pending.itemId)).toBeNull();
      expect(await uploads.objectStatus(objectKey)).toBe(404);
      expect(await uploads.usedBytes(user.userId)).toBe(usedBefore);
    });

    it('com o storage fora do ar, responde internal_error, devolve o espaço e deixa o upload em remoção', async () => {
      const { user, usedBefore, pending, objectKey } =
        await pendingWithObject();
      // O cancelamento da sessão e a remoção do objeto: o storage recusa os dois.
      proxy.failNext('DELETE');
      proxy.failNext('DELETE');

      const cancelled = await uploadRoutes(viaProxy).cancel(
        user.accessToken,
        pending.itemId,
      );

      expectProblem(cancelled, INTERNAL_ERROR);
      expect(await uploads.usedBytes(user.userId)).toBe(usedBefore);
      expect(await uploads.itemStatus(pending.itemId)).toBe('deleting');
      expect(await uploads.objectStatus(objectKey)).toBe(200);
    });

    it('a conclusão de um upload em remoção responde not_found', async () => {
      const { user, pending } = await pendingWithObject();
      proxy.failNext('DELETE');
      proxy.failNext('DELETE');
      await uploadRoutes(viaProxy)
        .cancel(user.accessToken, pending.itemId)
        .expect(500);

      const completed = await uploads.complete(
        user.accessToken,
        pending.itemId,
      );

      expectProblem(completed, NOT_FOUND);
      expect(await uploads.itemStatus(pending.itemId)).toBe('deleting');
    });

    it('a conclusão que não acha o objeto porque o expurgo tomou o upload no meio dela responde not_found, e não upload_incomplete', async () => {
      const user = await auth.signedInUser();
      const pending = await uploads.start(user.accessToken, {
        name: 'sem-objeto.txt',
        sizeBytes: 10,
      });
      // A conclusão já leu o upload pendente e fica parada na leitura do tamanho do objeto.
      const sizeCall = proxy.holdNext('GET');
      const completing = uploadRoutes(viaProxy)
        .complete(user.accessToken, pending.itemId)
        .then();
      await sizeCall.reached;
      proxy.failNext('DELETE');
      proxy.failNext('DELETE');
      await uploadRoutes(viaProxy)
        .cancel(user.accessToken, pending.itemId)
        .expect(500);

      sizeCall.release();
      const completed = await completing;

      expectProblem(completed, NOT_FOUND);
      expect(await uploads.itemStatus(pending.itemId)).toBe('deleting');
    });

    it('uma falha ao cancelar a sessão não impede a remoção do objeto, e o upload fica em remoção', async () => {
      const { user, usedBefore, pending, objectKey } =
        await pendingWithObject();
      // O emulador sempre aceita o cancelamento da sessão: a falha é a do proxy.
      proxy.failNext('DELETE');

      const cancelled = await uploadRoutes(viaProxy).cancel(
        user.accessToken,
        pending.itemId,
      );

      expectProblem(cancelled, INTERNAL_ERROR);
      expect(await uploads.objectStatus(objectKey)).toBe(404);
      expect(await uploads.usedBytes(user.userId)).toBe(usedBefore);
      expect(await uploads.itemStatus(pending.itemId)).toBe('deleting');
    });

    it('cancelar de novo um upload em remoção termina a remoção e responde 204, sem devolver o espaço outra vez', async () => {
      const { user, usedBefore, pending, objectKey } =
        await pendingWithObject();
      proxy.failNext('DELETE');
      proxy.failNext('DELETE');
      await uploadRoutes(viaProxy)
        .cancel(user.accessToken, pending.itemId)
        .expect(500);

      const again = await uploads.cancel(user.accessToken, pending.itemId);

      expect(again.status).toBe(204);
      expect(await uploads.itemStatus(pending.itemId)).toBeNull();
      expect(await uploads.objectStatus(objectKey)).toBe(404);
      expect(await uploads.usedBytes(user.userId)).toBe(usedBefore);
    });
  });
});
