import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// A CLI do Prisma roda fora do Nest, então lê o `.env` por conta própria.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
