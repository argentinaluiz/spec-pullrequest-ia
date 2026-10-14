import { randomUUID } from "node:crypto";
import { requiredEnv } from "./env";

/**
 * A rota de apoio da API para o emulador de storage (`/v1/dev/storage`), que só chama a interface
 * de storage. Sai quando o `POST /uploads` existir.
 */
async function probe<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${requiredEnv("API_URL")}/v1/dev/storage${path}`, {
    ...init,
    headers: { "content-type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(`A rota de apoio ${path} respondeu ${response.status}`);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

/** O nome de um objeto que nenhum outro teste usa. */
export function uniqueObjectName(): string {
  return `e2e/${randomUUID()}`;
}

/** Cria a sessão de upload e devolve o endereço dela, o mesmo que o navegador recebe. */
export async function createUploadSession(
  objectName: string,
  mimeType = "application/octet-stream",
): Promise<string> {
  const { sessionUrl } = await probe<{ sessionUrl: string }>("/session", {
    method: "POST",
    body: JSON.stringify({ objectName, mimeType }),
  });
  return sessionUrl;
}

/** A URL assinada de leitura, com o nome do arquivo para o download. */
export async function signReadUrl(
  objectName: string,
  fileName: string,
): Promise<string> {
  const query = new URLSearchParams({ objectName, fileName });
  const { url } = await probe<{ url: string }>(`/read-url?${query}`);
  return url;
}

/** O tamanho do objeto no storage, ou `null` se o envio ainda não terminou. */
export async function objectSize(objectName: string): Promise<number | null> {
  const query = new URLSearchParams({ objectName });
  const { sizeBytes } = await probe<{ sizeBytes: number | null }>(`/size?${query}`);
  return sizeBytes;
}

export async function deleteObject(objectName: string): Promise<void> {
  const query = new URLSearchParams({ objectName });
  await probe<void>(`/object?${query}`, { method: "DELETE" });
}
