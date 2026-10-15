import "server-only";
import { apiRequest } from "@/lib/api/client";
import type {
  ApiResult,
  CreateFolderInput,
  DownloadUrl,
  Item,
  ItemDetail,
  ItemPage,
} from "@/lib/api/types";

/* As rotas de Itens (docs/lld.md, seção 3.3). */

/**
 * Uma página dos Itens ativos de uma pasta (`root` ou o id de uma pasta ativa do Usuário), com
 * o tamanho de página padrão da API (50).
 */
export function listChildren(
  accessToken: string,
  folderId: string,
  cursor?: string,
): Promise<ApiResult<ItemPage>> {
  const search = cursor ? `?${new URLSearchParams({ cursor })}` : "";
  return apiRequest(`/items/${encodeURIComponent(folderId)}/children${search}`, {
    accessToken,
  });
}

/** Uma pasta ativa do Usuário (ou a raiz, por `root`) e o caminho do topo até ela. */
export function getFolder(
  accessToken: string,
  folderId: string,
): Promise<ApiResult<ItemDetail>> {
  return apiRequest(`/items/${encodeURIComponent(folderId)}`, { accessToken });
}

/** Cria uma pasta ativa dentro de `parentId`. */
export function createFolder(
  accessToken: string,
  input: CreateFolderInput,
): Promise<ApiResult<Item>> {
  return apiRequest("/folders", { method: "POST", body: input, accessToken });
}

/** A URL assinada de leitura de um arquivo ativo do Usuário, com o nome original no download. */
export function getItemDownloadUrl(
  accessToken: string,
  id: string,
): Promise<ApiResult<DownloadUrl>> {
  return apiRequest(`/items/${encodeURIComponent(id)}/download-url`, {
    accessToken,
  });
}
