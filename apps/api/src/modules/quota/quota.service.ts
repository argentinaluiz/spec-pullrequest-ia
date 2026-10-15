import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { QuotaExceededError } from './errors/quota-exceeded.error.js';
import { QuotaRepository } from './quota.repository.js';

/**
 * Service público do módulo de cota, dono de `quotas` e `plans`. Os outros
 * módulos reservam e devolvem espaço por ele, dentro da transação deles.
 */
@Injectable()
export class QuotaService {
  constructor(private readonly quota: QuotaRepository) {}

  /**
   * Reserva `bytes` na Cota do Usuário, que nasce no plano gratuito na
   * primeira vez (a linha só é criada quando a primeira tentativa falha). Lança `QuotaExceededError` se o espaço livre não comporta.
   */
  async reserve(
    userId: string,
    bytes: number,
    db: Prisma.TransactionClient,
  ): Promise<void> {
    if (await this.quota.reserve(userId, bytes, db)) {
      return;
    }
    // Sem linha de cota (primeiro uso) ou sem espaço: cria a linha, se faltar, e tenta de novo.
    await this.quota.ensure(userId, db);
    if (!(await this.quota.reserve(userId, bytes, db))) {
      throw new QuotaExceededError();
    }
  }

  /** Devolve `bytes` à Cota do Usuário. */
  release(
    userId: string,
    bytes: number,
    db: Prisma.TransactionClient,
  ): Promise<void> {
    return this.quota.release(userId, bytes, db);
  }
}
