import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { getSignedUrlOnEmulator } from '../../../test/support/storage-emulator.js';
import { AppConfigModule } from '../../config/config.module.js';
import { storageConfig } from '../../config/storage.config.js';
import { FILE_STORAGE, FileStorage } from './file-storage.js';
import { StorageModule } from './storage.module.js';

describe('Storage de arquivos no emulador', () => {
  let moduleRef: TestingModule;
  let storage: FileStorage;
  let config: ReturnType<typeof storageConfig>;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule.forRoot(), StorageModule],
    }).compile();
    storage = moduleRef.get<FileStorage>(FILE_STORAGE);
    config = moduleRef.get(storageConfig.KEY);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  /** O contêiner da API não alcança o endereço público, então o envio vai pelo host do emulador. */
  function viaEmulator(publicUrl: string): string {
    const url = new URL(publicUrl);
    const emulator = new URL(config.emulatorHost!);
    url.protocol = emulator.protocol;
    url.host = emulator.host;
    return url.toString();
  }

  async function putObject(objectName: string, body: string): Promise<void> {
    const session = await storage.createUploadSession({
      objectName,
      mimeType: 'text/plain',
      origin: 'http://localhost:3000',
    });
    const response = await fetch(viaEmulator(session), {
      method: 'PUT',
      body,
    });
    expect(response.status).toBe(200);
  }

  it('cria a sessão com o endereço público e lê o tamanho do objeto enviado @LUI-165-CA2', async () => {
    const objectName = `ca2/${randomUUID()}`;

    const session = await storage.createUploadSession({
      objectName,
      mimeType: 'text/plain',
      origin: 'http://localhost:3000',
    });
    await fetch(viaEmulator(session), { method: 'PUT', body: 'ola!!' });

    expect(new URL(session).origin).toBe(config.publicUrl);
    expect(await storage.getObjectSize(objectName)).toBe(5);
    expect(await storage.getObjectSize(`ca2/${randomUUID()}`)).toBeNull();
  });

  it('assina uma URL de leitura que devolve os bytes do objeto, com o nome do arquivo @LUI-165-CA3', async () => {
    const objectName = `ca3/${randomUUID()}`;
    await putObject(objectName, 'ola!!');
    const signedAt = Date.now();

    const { url: signedUrl, expiresAt } = await storage.signReadUrl({
      objectName,
      fileName: 'relatório.pdf',
      expiresInSeconds: 120,
    });
    const response = await getSignedUrlOnEmulator(
      config.emulatorHost,
      signedUrl,
    );

    expect(new URL(signedUrl).origin).toBe(config.publicUrl);
    expect(new URL(signedUrl).searchParams.get('X-Goog-Expires')).toBe('120');
    expect(Math.abs(expiresAt.getTime() - signedAt - 120 * 1000)).toBeLessThan(
      5_000,
    );
    expect(response.status).toBe(200);
    expect(response.body.toString()).toBe('ola!!');
    expect(response.headers['content-disposition']).toBe(
      "attachment; filename*=UTF-8''relat%C3%B3rio.pdf",
    );
  });

  it('apaga o objeto e cancela a sessão, sem erro se repetir @LUI-165-CA4', async () => {
    const objectName = `ca4/${randomUUID()}`;
    await putObject(objectName, 'ola!!');
    const session = await storage.createUploadSession({
      objectName: `ca4/${randomUUID()}`,
      mimeType: 'text/plain',
      origin: 'http://localhost:3000',
    });

    await storage.deleteObject(objectName);
    const sizeAfterDelete = await storage.getObjectSize(objectName);

    expect(sizeAfterDelete).toBeNull();
    await expect(storage.deleteObject(objectName)).resolves.toBeUndefined();
    await expect(storage.cancelUploadSession(session)).resolves.toBeUndefined();
    await expect(storage.cancelUploadSession(session)).resolves.toBeUndefined();
  });
});
