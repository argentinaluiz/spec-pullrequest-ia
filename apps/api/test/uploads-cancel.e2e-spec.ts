import { INestApplication, Logger } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { v7 as uuidv7 } from 'uuid';
import {
  FILE_STORAGE,
  type FileStorage,
} from '../src/infra/storage/file-storage.js';
import { authRoutes } from './support/auth-routes.js';
import { createTestApp } from './support/create-test-app.js';
import { NOT_FOUND, expectProblem } from './support/problem.js';
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('cancela o upload pendente e devolve o espaço, e responde not_found ao que não está pendente ou é de outro Usuário @LUI-170-CA8', async () => {
    const a = await auth.signedInUser();
    const b = await auth.signedInUser();
    await uploads.leaveFreeBytes(a.userId, 20);
    await uploads.leaveFreeBytes(b.userId, 20);
    const usedBefore = await uploads.usedBytes(a.userId);

    const pending = await uploads.start(a.accessToken, {
      name: 'cancelado.txt',
      sizeBytes: 10,
    });
    const objectKey = await uploads.objectKeyOf(pending.itemId);
    await uploads.putBytes(pending.uploadUrl, '0123456789');
    const usedWhilePending = await uploads.usedBytes(a.userId);

    const cancelled = await uploads.cancel(a.accessToken, pending.itemId);
    const usedAfter = await uploads.usedBytes(a.userId);
    const objectAfter = await uploads.objectStatus(objectKey);
    const completeAfter = await uploads.complete(a.accessToken, pending.itemId);
    const again = await uploads.cancel(a.accessToken, pending.itemId);

    const active = await uploads.start(a.accessToken, {
      name: 'ativo.txt',
      sizeBytes: 4,
    });
    await uploads.putBytes(active.uploadUrl, 'abcd');
    await uploads.complete(a.accessToken, active.itemId).expect(200);
    const usedWithActive = await uploads.usedBytes(a.userId);
    const cancelActive = await uploads.cancel(a.accessToken, active.itemId);

    const ofB = await uploads.start(b.accessToken, {
      name: 'do-b.txt',
      sizeBytes: 6,
    });
    const usedByB = await uploads.usedBytes(b.userId);
    const cancelOfB = await uploads.cancel(a.accessToken, ofB.itemId);
    const missing = await uploads.cancel(a.accessToken, uuidv7());
    const notUuid = await uploads.cancel(a.accessToken, 'nao-e-uuid');
    const anonymous = await uploads.cancel(undefined, ofB.itemId);

    expect(cancelled.status).toBe(204);
    expect(cancelled.text).toBe('');
    expect(usedWhilePending).toBe(usedBefore + 10);
    expect(usedAfter).toBe(usedBefore);
    expect(objectAfter).toBe(404);
    expectProblem(completeAfter, NOT_FOUND);
    expectProblem(again, NOT_FOUND);
    expectProblem(cancelActive, NOT_FOUND);
    expect(await uploads.usedBytes(a.userId)).toBe(usedWithActive);
    expectProblem(cancelOfB, NOT_FOUND);
    expectProblem(missing, NOT_FOUND);
    expectProblem(notUuid, NOT_FOUND);
    expectProblem(anonymous, {
      title: 'Unauthorized',
      status: 401,
      code: 'unauthenticated',
      detail: expect.any(String),
    });
    expect(await uploads.usedBytes(b.userId)).toBe(usedByB);
  });

  it('a conclusão que chega no meio do cancelamento responde not_found, e nenhum Item fica ativo sem o objeto', async () => {
    const a = await auth.signedInUser();
    await uploads.leaveFreeBytes(a.userId, 20);
    const usedBefore = await uploads.usedBytes(a.userId);
    const pending = await uploads.start(a.accessToken, {
      name: 'disputado.txt',
      sizeBytes: 10,
    });
    const objectKey = await uploads.objectKeyOf(pending.itemId);
    await uploads.putBytes(pending.uploadUrl, '0123456789');
    const storage = app.get<FileStorage>(FILE_STORAGE);
    const deleteObject = storage.deleteObject.bind(storage);
    let reachDelete = () => {};
    const deleteReached = new Promise<void>((resolve) => {
      reachDelete = resolve;
    });
    let finishComplete = () => {};
    const completeFinished = new Promise<void>((resolve) => {
      finishComplete = resolve;
    });
    // A conclusão chega e termina enquanto o cancelamento apaga o objeto.
    vi.spyOn(storage, 'deleteObject').mockImplementationOnce(async (key) => {
      reachDelete();
      await completeFinished;
      return deleteObject(key);
    });

    const cancelling = uploads.cancel(a.accessToken, pending.itemId).then();
    await deleteReached;
    const completed = await uploads.complete(a.accessToken, pending.itemId);
    finishComplete();
    const cancelled = await cancelling;

    expect(cancelled.status).toBe(204);
    expectProblem(completed, NOT_FOUND);
    expect(await uploads.objectStatus(objectKey)).toBe(404);
    expect(await uploads.usedBytes(a.userId)).toBe(usedBefore);
  });

  it('com o storage fora do ar depois de o Item sair, o cancelamento vale e a falha fica no log', async () => {
    const a = await auth.signedInUser();
    await uploads.leaveFreeBytes(a.userId, 20);
    const usedBefore = await uploads.usedBytes(a.userId);
    const pending = await uploads.start(a.accessToken, {
      name: 'storage-fora.txt',
      sizeBytes: 10,
    });
    await uploads.putBytes(pending.uploadUrl, '0123456789');
    const storage = app.get<FileStorage>(FILE_STORAGE);
    vi.spyOn(storage, 'deleteObject').mockRejectedValueOnce(
      new Error('storage fora do ar'),
    );
    const logError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const cancelled = await uploads.cancel(a.accessToken, pending.itemId);

    expect(cancelled.status).toBe(204);
    expect(await uploads.usedBytes(a.userId)).toBe(usedBefore);
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining(pending.itemId),
    );
  });
});
