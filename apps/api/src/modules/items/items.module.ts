import { Module } from '@nestjs/common';
import { AccessTokensModule } from '../../common/auth/access-tokens.module.js';
import { ItemsController } from './items.controller.js';
import { ItemsRepository } from './items.repository.js';
import { ItemsService } from './items.service.js';

/** Dono dos Itens e da Pasta raiz. */
@Module({
  imports: [AccessTokensModule],
  controllers: [ItemsController],
  providers: [ItemsService, ItemsRepository],
  exports: [ItemsService],
})
export class ItemsModule {}
