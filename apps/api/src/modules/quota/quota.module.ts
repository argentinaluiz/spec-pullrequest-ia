import { Module } from '@nestjs/common';
import { QuotaRepository } from './quota.repository.js';
import { QuotaService } from './quota.service.js';

/** Dono da Cota e dos planos. */
@Module({
  providers: [QuotaService, QuotaRepository],
  exports: [QuotaService],
})
export class QuotaModule {}
