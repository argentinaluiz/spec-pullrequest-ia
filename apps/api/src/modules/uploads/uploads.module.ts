import { Module } from '@nestjs/common';
import { AccessTokensModule } from '../../common/auth/access-tokens.module.js';
import { StorageModule } from '../../infra/storage/storage.module.js';
import { ItemsModule } from '../items/items.module.js';
import { QuotaModule } from '../quota/quota.module.js';
import { UploadsController } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';

/** Dono do início e da conclusão do envio de arquivos. */
@Module({
  imports: [AccessTokensModule, StorageModule, ItemsModule, QuotaModule],
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
