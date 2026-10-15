import { registerAs } from '@nestjs/config';
import { validatedEnv } from './env.js';

const HOUR_MS = 60 * 60 * 1000;

export const uploadsConfig = registerAs('uploads', () => ({
  /** Quanto tempo um upload fica pendente, em milissegundos, antes de a limpeza o remover. */
  pendingTtlMs: validatedEnv().PENDING_UPLOAD_TTL_HOURS * HOUR_MS,
}));
