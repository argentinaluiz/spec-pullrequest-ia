import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { appConfig } from '../../config/app.config.js';
import {
  FILE_STORAGE,
  type FileStorage,
} from '../../infra/storage/file-storage.js';

/** Expõe a interface de storage aos testes no navegador. Só existe com o emulador. */
@Injectable()
export class StorageProbeService {
  constructor(
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @Inject(appConfig.KEY) private readonly app: ConfigType<typeof appConfig>,
  ) {}

  async createSession(objectName: string, mimeType: string) {
    const sessionUrl = await this.storage.createUploadSession({
      objectName,
      mimeType,
      origin: this.app.webOrigin,
    });
    return { sessionUrl };
  }

  async readUrl(objectName: string, fileName: string) {
    return { url: await this.storage.signReadUrl({ objectName, fileName }) };
  }

  async size(objectName: string) {
    return { sizeBytes: await this.storage.getObjectSize(objectName) };
  }

  deleteObject(objectName: string): Promise<void> {
    return this.storage.deleteObject(objectName);
  }
}
