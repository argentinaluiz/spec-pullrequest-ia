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
 * Grava arquivos ativos direto na Pasta raiz do Usuário do e-mail, como preparação, e devolve os
 * ids deles. A raiz nasce quando a lista é aberta pela primeira vez, então o Usuário já tem de
 * ter entrado. Como a lista carrega em paralelo com a casca, a raiz pode ainda não existir logo
 * depois de entrar, e a busca por ela é repetida por alguns segundos. Para ver os arquivos,
 * recarregue a página.
 */
export async function seedRootFiles(
  email: string,
  files: SeedFile[],
): Promise<string[]> {
  const { rootId } = await withDatabase((client) => findFolderOwner(client, email));
  return seedFilesIn(email, rootId, files);
}

/** Quem é dono de uma pasta e onde ela fica, para gravar Itens dentro dela. */
interface FolderOwner {
  ownerId: string;
  rootId: string;
}

async function findFolderOwner(client: Client, email: string): Promise<FolderOwner> {
  const deadline = Date.now() + ROOT_WAIT_MS;
  for (;;) {
    const { rows } = await client.query<{ id: string; owner_id: string }>(
      `SELECT items.id, items.owner_id
         FROM items JOIN users ON users.id = items.owner_id
        WHERE users.email = $1 AND items.parent_id IS NULL`,
      [email],
    );
    if (rows[0]) return { ownerId: rows[0].owner_id, rootId: rows[0].id };
    if (Date.now() >= deadline) {
      throw new Error(
        `O Usuário ${email} ainda não tem a Pasta raiz: entre com ele antes de gravar as pastas.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/**
 * Grava uma pasta ativa direto no banco, como preparação, dentro de `parentId` (a Pasta raiz se
 * ele faltar), e devolve o id dela. O Usuário já tem de ter entrado, porque a raiz nasce na
 * primeira listagem. Para ver a pasta, recarregue a página.
 */
export async function seedFolder(
  email: string,
  name: string,
  parentId?: string,
): Promise<string> {
  const [id] = await seedFolderChain(email, [name], parentId);
  return id;
}

/** Grava uma cadeia de pastas, cada uma dentro da anterior, e devolve os ids, do topo ao fim. */
export async function seedFolderChain(
  email: string,
  names: string[],
  parentId?: string,
): Promise<string[]> {
  return withDatabase(async (client) => {
    const { ownerId, rootId } = await findFolderOwner(client, email);
    const ids: string[] = [];
    let parent = parentId ?? rootId;
    for (const name of names) {
      const id = randomUUID();
      await client.query(
        `INSERT INTO items (id, owner_id, parent_id, type, name, status, updated_at)
         VALUES ($1, $2, $3, 'folder', $4, 'active', now())`,
        [id, ownerId, parent, name],
      );
      ids.push(id);
      parent = id;
    }
    return ids;
  });
}

/** Grava arquivos ativos direto no banco, dentro da pasta `folderId`, e devolve os ids deles. */
export async function seedFilesIn(
  email: string,
  folderId: string,
  files: SeedFile[],
): Promise<string[]> {
  return withDatabase(async (client) => {
    const { ownerId } = await findFolderOwner(client, email);
    const ids: string[] = [];
    for (const file of files) {
      const id = randomUUID();
      ids.push(id);
      await client.query(
        `INSERT INTO items
           (id, owner_id, parent_id, type, name, status, size_bytes, mime_type, object_key, updated_at)
         VALUES ($1, $2, $3, 'file', $4, 'active', $5, $6, $7, $8)`,
        [
          id,
          ownerId,
          folderId,
          file.name,
          file.sizeBytes ?? 1024,
          file.mimeType ?? "text/plain",
          randomUUID(),
          file.updatedAt ?? new Date(),
        ],
      );
    }
    return ids;
  });
}
