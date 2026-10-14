import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { v7 as uuidv7 } from 'uuid';
import { PrismaService } from '../src/infra/database/prisma.service.js';
import { authRoutes } from './support/auth-routes.js';
import { storageConfig } from '../src/config/storage.config.js';
import { createTestApp } from './support/create-test-app.js';
import { itemRoutes } from './support/items.js';
import { uniqueEmail } from './support/mailpit.js';
import { expectProblem, expectValidationError } from './support/problem.js';
import { uploadRoutes } from './support/uploads.js';

describe('Início do envio de um arquivo', () => {
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

  /** Um Usuário verificado, com Sessão, e o id dele. */
  const signedInUser = async () => {
    const { accessToken } = await auth.openSession(uniqueEmail());
    const { body } = await auth.me(accessToken).expect(200);
    return { accessToken, userId: (body as { id: string }).id };
  };

  it('cria o upload, recebe os bytes no storage e conclui, e o arquivo aparece na lista da raiz @LUI-167-CA1', async () => {
    const { accessToken } = await signedInUser();
    const before = Date.now();
    const created = await uploads
      .create(accessToken, {
        name: 'relatorio.txt',
        sizeBytes: 5,
        mimeType: 'text/plain',
        parentId: 'root',
      })
      .expect(201);
    const { itemId, uploadUrl, expiresAt } = created.body as {
      itemId: string;
      uploadUrl: string;
      expiresAt: string;
    };
    const listedBeforeSend = await items
      .listChildren('root', accessToken)
      .expect(200);

    const sent = await uploads.putBytes(uploadUrl, 'ola!!');
    const completed = await uploads.complete(accessToken, itemId).expect(200);
    const listedAfter = await items
      .listChildren('root', accessToken)
      .expect(200);

    expect(itemId).toMatch(/^[0-9a-f-]{36}$/);
    expect(new URL(uploadUrl).origin).toBe(
      new URL(app.get(storageConfig.KEY).publicUrl ?? '').origin,
    );
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(before);
    expect(listedBeforeSend.body).toEqual({ items: [], nextCursor: null });
    expect(sent.status).toBe(200);
    expect(completed.body).toEqual({
      id: itemId,
      type: 'file',
      name: 'relatorio.txt',
      sizeBytes: 5,
      mimeType: 'text/plain',
      updatedAt: expect.any(String),
    });
    expect(listedAfter.body).toEqual({
      items: [completed.body],
      nextCursor: null,
    });
  });

  it('recusa com quota_exceeded um upload que não cabe, sem criar Item nem gastar espaço @LUI-167-CA2', async () => {
    const { accessToken, userId } = await signedInUser();
    await uploads.leaveFreeBytes(userId, 9);

    const refused = await uploads.create(accessToken, {
      name: 'grande.bin',
      sizeBytes: 10,
      parentId: 'root',
    });
    const pendingAfterRefusal = await app
      .get(PrismaService)
      .item.count({ where: { ownerId: userId, status: 'pending' } });
    const fits = await uploads.create(accessToken, {
      name: 'cabe.bin',
      sizeBytes: 9,
      parentId: 'root',
    });

    expectProblem(refused, {
      title: 'Payload Too Large',
      status: 413,
      code: 'quota_exceeded',
      detail: expect.any(String),
    });
    expect(pendingAfterRefusal).toBe(0);
    expect(fits.status).toBe(201);
  });

  it('aceita só os uploads simultâneos que cabem na Cota @LUI-167-CA3', async () => {
    const { accessToken, userId } = await signedInUser();
    const GiB = 1024 ** 3;
    await uploads.leaveFreeBytes(userId, 2.5 * GiB);

    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        uploads.create(accessToken, {
          name: `arquivo-${index}.bin`,
          sizeBytes: GiB,
          parentId: 'root',
        }),
      ),
    );
    const half = await uploads.create(accessToken, {
      name: 'meio.bin',
      sizeBytes: GiB / 2,
      parentId: 'root',
    });
    const oneByte = await uploads.create(accessToken, {
      name: 'um.bin',
      sizeBytes: 1,
      parentId: 'root',
    });

    const statuses = responses
      .map((response) => response.status)
      .sort((a, b) => a - b);
    expect(statuses).toEqual([201, 201, 413, 413, 413]);
    for (const response of responses.filter(({ status }) => status === 413)) {
      expect((response.body as { code: string }).code).toBe('quota_exceeded');
    }
    expect(half.status).toBe(201);
    expect(oneByte.status).toBe(413);
    expect(await uploads.usedBytes(userId)).toBe(await uploads.freePlanBytes());
  });

  it('recusa com file_too_large o arquivo acima de 5 GB, antes de reservar espaço @LUI-167-CA4', async () => {
    const GiB = 1024 ** 3;
    const full = await signedInUser();
    await uploads.leaveFreeBytes(full.userId, 0);
    const roomy = await signedInUser();
    await uploads.leaveFreeBytes(roomy.userId, 6 * GiB);

    const tooLargeForFullQuota = await uploads.create(full.accessToken, {
      name: 'enorme.bin',
      sizeBytes: 5 * GiB + 1,
      parentId: 'root',
    });
    const exactly5GiB = await uploads.create(roomy.accessToken, {
      name: 'cinco.bin',
      sizeBytes: 5 * GiB,
      parentId: 'root',
    });
    const tooLarge = await uploads.create(roomy.accessToken, {
      name: 'enorme.bin',
      sizeBytes: 5 * GiB + 1,
      parentId: 'root',
    });
    const oneGiB = await uploads.create(roomy.accessToken, {
      name: 'um-giga.bin',
      sizeBytes: GiB,
      parentId: 'root',
    });

    expectProblem(tooLargeForFullQuota, {
      title: 'Payload Too Large',
      status: 413,
      code: 'file_too_large',
      detail: expect.any(String),
    });
    expect(exactly5GiB.status).toBe(201);
    expect(tooLarge.status).toBe(413);
    expect((tooLarge.body as { code: string }).code).toBe('file_too_large');
    expect(oneGiB.status).toBe(201);
  });

  it('recusa nome, tamanho e destino inválidos, sem criar Item @LUI-167-CA5', async () => {
    const { accessToken, userId } = await signedInUser();
    const other = await signedInUser();
    const prisma = app.get(PrismaService);
    const root = await items.rootId(accessToken, userId);
    const otherRoot = await items.rootId(other.accessToken, other.userId);
    const [ownFile, ownTrashedFolder] = await items.seed(userId, root, [
      { name: 'meu.txt' },
      { name: 'lixo', type: 'folder', status: 'trashed' },
    ]);
    const [othersFolder] = await items.seed(other.userId, otherRoot, [
      { name: 'dele', type: 'folder' },
    ]);
    const valid = { name: 'a.txt', sizeBytes: 1, parentId: 'root' };
    const invalidFields: [string, Record<string, unknown>][] = [
      ['name', { name: '' }],
      ['name', { name: 'a/b.txt' }],
      ['name', { name: 'a\nb.txt' }],
      ['name', { name: '   ' }],
      ['name', { name: '..' }],
      ['name', { name: 'a'.repeat(256) }],
      ['sizeBytes', { sizeBytes: -1 }],
      ['sizeBytes', { sizeBytes: 1.5 }],
      ['sizeBytes', { sizeBytes: '10' }],
    ];
    const missingParents = [
      uuidv7(),
      ownFile,
      othersFolder,
      ownTrashedFolder,
      'nao-e-uuid',
    ];

    const validationResponses = await Promise.all(
      invalidFields.map(([, change]) =>
        uploads.create(accessToken, { ...valid, ...change }),
      ),
    );
    const notFoundResponses = await Promise.all(
      missingParents.map((parentId) =>
        uploads.create(accessToken, { ...valid, parentId }),
      ),
    );
    const unauthenticated = await uploads.create(undefined, valid);
    const pendingAfter = await prisma.item.count({
      where: { ownerId: userId, status: 'pending' },
    });
    const usedAfter = await uploads.usedBytes(userId);
    const longestName = await uploads.create(accessToken, {
      ...valid,
      name: 'a'.repeat(255),
    });
    const spacedName = await uploads.create(accessToken, {
      ...valid,
      name: 'a.b c.txt',
    });

    validationResponses.forEach((response, index) => {
      expectValidationError(response, invalidFields[index][0]);
    });
    for (const response of notFoundResponses) {
      expectProblem(response, {
        title: 'Not Found',
        status: 404,
        code: 'not_found',
        detail: expect.any(String),
      });
    }
    expectProblem(unauthenticated, {
      title: 'Unauthorized',
      status: 401,
      code: 'unauthenticated',
      detail: expect.any(String),
    });
    expect(pendingAfter).toBe(0);
    expect(usedAfter).toBe(0);
    expect(longestName.status).toBe(201);
    expect(spacedName.status).toBe(201);
  });
});
