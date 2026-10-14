import { requiredEnv } from "./env";
import { withDatabase } from "./items";

/*
 * As chamadas diretas à API que os testes do emulador de storage precisam: criam a sessão de
 * envio por `POST /uploads`, o mesmo caminho da tela, e conferem o tamanho pela conclusão.
 */

async function api(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${requiredEnv("API_URL")}/v1${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
  });
}

/** Cria o envio e devolve o endereço da sessão, o mesmo que o navegador recebe. */
export async function createUpload(
  accessToken: string,
  input: { sizeBytes: number; mimeType?: string; name?: string },
): Promise<{ itemId: string; uploadUrl: string }> {
  const response = await api("/uploads", accessToken, {
    method: "POST",
    body: JSON.stringify({
      name: "arquivo-de-teste.bin",
      parentId: "root",
      ...input,
    }),
  });
  if (!response.ok) {
    throw new Error(`POST /uploads respondeu ${response.status}`);
  }
  return (await response.json()) as { itemId: string; uploadUrl: string };
}

/** A conclusão do envio: 200 com o Item quando os bytes chegaram com o tamanho declarado. */
export async function completeUpload(
  accessToken: string,
  itemId: string,
): Promise<{ status: number; item: { sizeBytes: number } }> {
  const response = await api(`/uploads/${itemId}/complete`, accessToken, {
    method: "POST",
  });
  return {
    status: response.status,
    item: (await response.json()) as { sizeBytes: number },
  };
}

/** A URL assinada de leitura do arquivo do Item, com o nome para o download. */
export async function signReadUrl(
  itemId: string,
  fileName: string,
): Promise<string> {
  const objectName = await withDatabase(async (client) => {
    const { rows } = await client.query<{ object_key: string }>(
      "SELECT object_key FROM items WHERE id = $1",
      [itemId],
    );
    return rows[0].object_key;
  });
  const query = new URLSearchParams({ objectName, fileName });
  // Até o download existir (LUI-168), nenhuma rota entrega a URL: a rota de apoio a assina.
  const response = await fetch(
    `${requiredEnv("API_URL")}/v1/dev/storage/read-url?${query}`,
  );
  if (!response.ok) {
    throw new Error(`A rota de apoio respondeu ${response.status}`);
  }
  return ((await response.json()) as { url: string }).url;
}
