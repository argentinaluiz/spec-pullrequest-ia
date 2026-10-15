import { requiredEnv } from "./env";

/*
 * As chamadas diretas à API que os testes do emulador de storage precisam: criam a sessão de
 * envio por `POST /uploads`, o mesmo caminho da tela, conferem o tamanho pela conclusão e pedem a URL de leitura.
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

/** A URL assinada de leitura do arquivo do Item, pedida à API como a rota de download faz. */
export async function downloadUrlOf(
  accessToken: string,
  itemId: string,
): Promise<string> {
  const response = await api(`/items/${itemId}/download-url`, accessToken);
  if (!response.ok) {
    throw new Error(`GET /items/{id}/download-url respondeu ${response.status}`);
  }
  return ((await response.json()) as { url: string }).url;
}
