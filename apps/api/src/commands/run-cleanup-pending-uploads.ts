import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../app.module.js';
import { UploadsService } from '../modules/uploads/uploads.service.js';

// Comando da limpeza de uploads pendentes vencidos. Uso e saída: apps/api/AGENTS.md.
let app: INestApplicationContext | undefined;
try {
  app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
    abortOnError: false,
  });
  const { removed, failed } = await app
    .get(UploadsService, { strict: false })
    .cleanupPending();
  console.log(`Uploads pendentes removidos: ${removed}. Falhas: ${failed}.`);
  process.exitCode = failed > 0 ? 1 : 0;
} catch (error) {
  // O erro do Prisma traz várias linhas; a última é a causa.
  const message = error instanceof Error ? error.message : String(error);
  const cause = message.trim().split('\n').at(-1)?.trim() ?? message;
  console.error(`A limpeza de uploads pendentes falhou: ${cause}`);
  process.exitCode = 1;
} finally {
  await app?.close().catch(() => undefined);
}
