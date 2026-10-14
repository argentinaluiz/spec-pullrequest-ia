import { Inject, Injectable } from '@nestjs/common';
import {
  FILE_STORAGE,
  type FileStorage,
} from '../../infra/storage/file-storage.js';

/** Expõe a URL de leitura aos testes no navegador. Só existe com o emulador. */
@Injectable()
export class StorageProbeService {
  constructor(@Inject(FILE_STORAGE) private readonly storage: FileStorage) {}

  async readUrl(objectName: string, fileName: string) {
    return { url: await this.storage.signReadUrl({ objectName, fileName }) };
  }
}
