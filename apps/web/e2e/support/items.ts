import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { requiredEnv } from "./env";

/** Um arquivo ativo a gravar na Pasta raiz. Os campos que faltam ganham um valor qualquer. */
export interface SeedFile {
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  updatedAt?: Date;
}

/** Abre uma conexão com o banco da API que a web usa, roda `work` e fecha a conexão. */
export async function withDatabase<T>(
  work: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: requiredEnv("DATABASE_URL") });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/**
 * Grava arquivos ativos direto na Pasta raiz do Usuário do e-mail, como preparação: até o
 * upload existir, nenhuma tela cria um Item. A raiz nasce quando a lista é aberta pela primeira
 * vez, então o Usuário já tem de ter entrado. Para ver os arquivos, recarregue a página.
 */
export async function seedRootFiles(email: string, files: SeedFile[]) {
  await withDatabase(async (client) => {
    const { rows } = await client.query<{ id: string; owner_id: string }>(
      `SELECT items.id, items.owner_id
         FROM items JOIN users ON users.id = items.owner_id
        WHERE users.email = $1 AND items.parent_id IS NULL`,
      [email],
    );
    const root = rows[0];
    if (!root) {
      throw new Error(
        `O Usuário ${email} ainda não tem a Pasta raiz: entre com ele antes de gravar os arquivos.`,
      );
    }
    for (const file of files) {
      await client.query(
        `INSERT INTO items
           (id, owner_id, parent_id, type, name, status, size_bytes, mime_type, object_key, updated_at)
         VALUES ($1, $2, $3, 'file', $4, 'active', $5, $6, $7, $8)`,
        [
          randomUUID(),
          root.owner_id,
          root.id,
          file.name,
          file.sizeBytes ?? 1024,
          file.mimeType ?? "text/plain",
          randomUUID(),
          file.updatedAt ?? new Date(),
        ],
      );
    }
  });
}
