import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'node:fs';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { buildOpenApiDocument } from './build-document.js';

// Gera o snapshot da OpenAPI no arquivo dado. Compilado com o plugin do @nestjs/swagger, que lê os
// DTOs: use `pnpm openapi:generate`, que faz a compilação.
const [output] = process.argv.slice(2);
if (!output) {
  console.error('Uso: node generate-openapi.js <arquivo de saída>');
  process.exit(2);
}

const app = await NestFactory.create(AppModule, { logger: false });
configureApp(app);
try {
  writeFileSync(output, `${JSON.stringify(buildOpenApiDocument(app), null, 2)}\n`);
} finally {
  await app.close();
}
