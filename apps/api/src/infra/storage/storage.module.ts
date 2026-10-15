import { Module } from '@nestjs/common';
import { FILE_STORAGE } from './file-storage.js';
import { GcsFileStorage } from './gcs-file-storage.js';

@Module({
  providers: [{ provide: FILE_STORAGE, useClass: GcsFileStorage }],
  exports: [FILE_STORAGE],
})
export class StorageModule {}
