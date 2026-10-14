import { Module } from '@nestjs/common';
import { StorageModule } from '../../infra/storage/storage.module.js';
import { StorageProbeController } from './storage-probe.controller.js';
import { StorageProbeService } from './storage-probe.service.js';

@Module({
  imports: [StorageModule],
  controllers: [StorageProbeController],
  providers: [StorageProbeService],
})
export class StorageProbeModule {}
