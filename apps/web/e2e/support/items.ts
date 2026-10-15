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

/** Quanto esperar a Pasta raiz nascer depois de entrar, em milissegundos. */
const ROOT_WAIT_MS = 5_000;

/**
 * Grava arquivos ativos direto na Pasta raiz do Usuário do e-mail, como preparação: até o
 * upload existir, nenhuma tela cria um Item. A raiz nasce quando a lista é aberta pela primeira
 * vez, então o Usuário já tem de ter entrado. Como a lista carrega em paralelo com a casca, a
 * raiz pode ainda não existir logo depois de entrar, e a busca por ela é repetida por alguns
 * segundos. Para ver os arquivos, recarregue a página.
 */
export async function seedRootFiles(email: string, files: SeedFile[]) {
  await withDatabase(async (client) => {
    const findRoot = async () => {
      const { rows } = await client.query<{ id: string; owner_id: string }>(
        `SELECT items.id, items.owner_id
           FROM items JOIN users ON users.id = items.owner_id
          WHERE users.email = $1 AND items.parent_id IS NULL`,
        [email],
      );
      return rows[0];
    };
    const deadline = Date.now() + ROOT_WAIT_MS;
    let root = await findRoot();
    while (!root && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      root = await findRoot();
    }
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

/** O tamanho gravado na API para o arquivo ativo do Usuário com esse nome, ou `null` se ele não existe. */
export async function storedSizeOf(email: string, name: string): Promise<number | null> {
  return withDatabase(async (client) => {
    const { rows } = await client.query<{ size_bytes: string }>(
      `SELECT items.size_bytes FROM items JOIN users ON users.id = items.owner_id
        WHERE users.email = $1 AND items.name = $2 AND items.status = 'active'`,
      [email, name],
    );
    return rows[0] ? Number(rows[0].size_bytes) : null;
  });
}
