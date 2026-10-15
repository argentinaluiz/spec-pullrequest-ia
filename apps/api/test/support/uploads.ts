import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { storageConfig } from '../../src/config/storage.config.js';
import { PrismaService } from '../../src/infra/database/prisma.service.js';

/** O corpo de `POST /uploads`. */
export interface UploadInput {
  name?: unknown;
  sizeBytes?: unknown;
  mimeType?: unknown;
  parentId?: unknown;
}

/** As chamadas do envio de arquivos e a preparação dele, contra uma aplicação de teste. */
export function uploadRoutes(app: INestApplication<App>) {
  const prisma = app.get(PrismaService);
  const storage = app.get<{
    bucket: string;
    emulatorHost?: string;
  }>(storageConfig.KEY);

  /** `POST /uploads`, com o token de acesso no cabeçalho quando ele é passado. */
  const create = (accessToken: string | undefined, input: UploadInput) => {
    const call = request(app.getHttpServer()).post('/v1/uploads').send(input);
    return accessToken
      ? call.set('Authorization', `Bearer ${accessToken}`)
      : call;
  };

  /** `POST /uploads/{itemId}/complete`. */
  const complete = (accessToken: string, itemId: string) =>
    request(app.getHttpServer())
      .post(`/v1/uploads/${itemId}/complete`)
      .set('Authorization', `Bearer ${accessToken}`);

  /** `DELETE /uploads/{itemId}`, com o token de acesso quando ele é passado. */
  const cancel = (accessToken: string | undefined, itemId: string) => {
    const call = request(app.getHttpServer()).delete(`/v1/uploads/${itemId}`);
    return accessToken
      ? call.set('Authorization', `Bearer ${accessToken}`)
      : call;
  };

  /**
   * O endereço da sessão que a API devolve é o público (`STORAGE_PUBLIC_URL`),
   * que o contêiner da API não alcança. No papel do navegador, o teste troca a
   * origem pela do emulador (`STORAGE_EMULATOR_HOST`).
   */
  const viaEmulator = (uploadUrl: string): string => {
    const url = new URL(uploadUrl);
    const emulator = new URL(storage.emulatorHost ?? '');
    url.protocol = emulator.protocol;
    url.host = emulator.host;
    return url.toString();
  };

  /** Envia os bytes à sessão, como o navegador faz, num único `PUT`. */
  const putBytes = (uploadUrl: string, body?: string): Promise<Response> =>
    fetch(viaEmulator(uploadUrl), { method: 'PUT', body });

  /** Cria o upload e devolve o que a API respondeu, esperando 201. */
  const start = async (
    accessToken: string,
    input: { name: string; sizeBytes: number; mimeType?: string },
  ) => {
    const { body } = await create(accessToken, {
      parentId: 'root',
      ...input,
    }).expect(201);
    return body as { itemId: string; uploadUrl: string; expiresAt: string };
  };

  /** Quantos bytes a Cota do Usuário usa, 0 se ela ainda não nasceu. */
  const usedBytes = async (userId: string): Promise<number> => {
    const quota = await prisma.quota.findUnique({ where: { userId } });
    return Number(quota?.usedBytes ?? 0);
  };

  /**
   * Deixa a Cota do Usuário com `freeBytes` livres no plano gratuito. Nenhuma
   * rota produz esse estado, então a linha é gravada direto no banco.
   */
  const leaveFreeBytes = async (userId: string, freeBytes: number) => {
    const plan = await prisma.plan.findUniqueOrThrow({
      where: { code: 'free' },
    });
    const usedBytes = plan.storageBytes - BigInt(freeBytes);
    await prisma.quota.upsert({
      where: { userId },
      create: { userId, planId: plan.id, usedBytes },
      update: { usedBytes },
    });
  };

  /** O limite de bytes do plano gratuito. */
  const freePlanBytes = async (): Promise<number> => {
    const plan = await prisma.plan.findUniqueOrThrow({
      where: { code: 'free' },
    });
    return Number(plan.storageBytes);
  };

  /** O status HTTP da leitura do objeto no emulador, pela chave que o banco guarda. */
  const objectStatus = async (objectKey: string): Promise<number> => {
    const response = await fetch(
      `${storage.emulatorHost}/storage/v1/b/${storage.bucket}/o/${encodeURIComponent(objectKey)}`,
    );
    return response.status;
  };

  /** A chave do objeto do Item, gravada no banco. */
  const objectKeyOf = async (itemId: string): Promise<string> => {
    const item = await prisma.item.findUniqueOrThrow({
      where: { id: itemId },
      select: { objectKey: true },
    });
    return item.objectKey ?? '';
  };

  /**
   * Envia `body` à sessão num único `PUT`, que termina o envio, e devolve a
   * chave do objeto. Falha se o emulador não criou o objeto.
   */
  const storeObject = async (
    upload: { itemId: string; uploadUrl: string },
    body: string,
  ): Promise<string> => {
    await putBytes(upload.uploadUrl, body);
    const objectKey = await objectKeyOf(upload.itemId);
    const status = await objectStatus(objectKey);
    if (status !== 200) {
      throw new Error(
        `O objeto do upload ${upload.itemId} não foi criado no emulador (${status}).`,
      );
    }
    return objectKey;
  };

  /** O status gravado do Item, ou `null` se a linha não existe mais. */
  const itemStatus = async (itemId: string): Promise<string | null> => {
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { status: true },
    });
    return item?.status ?? null;
  };

  /**
   * Leva o `updated_at` do Item para `minutes` minutos atrás. Num upload em
   * remoção, é o instante em que o expurgo o tomou. Nenhuma rota produz um
   * Item gravado há tempos, então a linha é gravada direto no banco.
   */
  const updatedMinutesAgo = async (itemId: string, minutes: number) => {
    await prisma.item.update({
      where: { id: itemId },
      data: { updatedAt: new Date(Date.now() - minutes * 60 * 1000) },
    });
  };

  return {
    create,
    complete,
    cancel,
    putBytes,
    start,
    usedBytes,
    leaveFreeBytes,
    freePlanBytes,
    objectStatus,
    objectKeyOf,
    storeObject,
    itemStatus,
    updatedMinutesAgo,
  };
}
