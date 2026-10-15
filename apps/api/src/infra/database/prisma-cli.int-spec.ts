import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const PRISMA = resolve('node_modules/.bin/prisma');
const CONFIG = resolve('prisma.config.ts');

// As portas não têm ninguém ouvindo, e é isso que faz o erro mostrar a URL.
const FROM_FILE = 'postgresql://app:app@postgres:2/do_arquivo';
const FROM_ENV = 'postgresql://app:app@postgres:1/do_ambiente';

/**
 * Roda `prisma migrate status` com a configuração real da CLI, de uma pasta
 * vazia, e devolve a saída. O comando sempre falha, porque nenhum banco responde,
 * e o erro mostra de onde a CLI tirou a URL.
 */
async function migrateStatus(dotenvUrl?: string): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'prisma-cli-'));
  try {
    if (dotenvUrl) {
      await writeFile(join(cwd, '.env'), `DATABASE_URL=${dotenvUrl}\n`);
    }
    const { stdout, stderr } = await run(
      PRISMA,
      ['migrate', 'status', '--config', CONFIG],
      { cwd },
    ).catch((error: { stdout: string; stderr: string }) => error);
    return stdout + stderr;
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

describe('Configuração da CLI do Prisma', () => {
  it('falha apontando DATABASE_URL quando a variável não existe nem no ambiente nem no .env', async () => {
    vi.stubEnv('DATABASE_URL', undefined);

    const output = await migrateStatus();

    expect(output).toContain('DATABASE_URL');
  });

  it('lê a URL do banco do .env quando o ambiente não a define', async () => {
    vi.stubEnv('DATABASE_URL', undefined);

    const output = await migrateStatus(FROM_FILE);

    expect(output).toContain('postgres:2');
  });

  it('prefere a variável do ambiente à do .env', async () => {
    vi.stubEnv('DATABASE_URL', FROM_ENV);

    const output = await migrateStatus(FROM_FILE);

    expect(output).toContain('postgres:1');
    expect(output).not.toContain('postgres:2');
  });
});
