import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';

/** Código do plano em que a Cota de todo Usuário nasce. */
const FREE_PLAN_CODE = 'free';

@Injectable()
export class QuotaRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cria a linha da Cota do Usuário no plano gratuito, se ela ainda não
   * existe. Com chamadas simultâneas, uma insere e as outras não fazem nada.
   */
  async ensure(
    userId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await db.$executeRaw`
      INSERT INTO quotas (user_id, plan_id, used_bytes, updated_at)
      SELECT ${userId}::uuid, p.id, 0, now() FROM plans p WHERE p.code = ${FREE_PLAN_CODE}
      ON CONFLICT (user_id) DO NOTHING`;
  }

  /**
   * Soma `bytes` ao uso, num único `UPDATE` condicionado ao limite do plano:
   * o bloqueio da linha serializa as reservas simultâneas. Devolve `false`
   * quando não cabe.
   */
  async reserve(
    userId: string,
    bytes: number,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<boolean> {
    const updated = await db.$executeRaw`
      UPDATE quotas q
      SET used_bytes = q.used_bytes + ${BigInt(bytes)}::bigint, updated_at = now()
      FROM plans p
      WHERE q.user_id = ${userId}::uuid
        AND p.id = q.plan_id
        AND q.used_bytes + ${BigInt(bytes)}::bigint <= p.storage_bytes`;
    return updated > 0;
  }

  /** Subtrai `bytes` do uso, sem passar de zero. */
  async release(
    userId: string,
    bytes: number,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await db.$executeRaw`
      UPDATE quotas
      SET used_bytes = GREATEST(used_bytes - ${BigInt(bytes)}::bigint, 0), updated_at = now()
      WHERE user_id = ${userId}::uuid`;
  }
}
