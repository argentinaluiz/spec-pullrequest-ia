import "server-only";
import { apiRequest } from "@/lib/api/client";
import type { ApiResult, DownloadUrl, ItemPage } from "@/lib/api/types";

/* As rotas de Itens (docs/lld.md, seção 3.3). */

/** Uma página dos Itens ativos da Pasta raiz, com o tamanho de página padrão da API (50). */
export function listRootChildren(
  accessToken: string,
  cursor?: string,
): Promise<ApiResult<ItemPage>> {
  const search = cursor ? `?${new URLSearchParams({ cursor })}` : "";
  return apiRequest(`/items/root/children${search}`, { accessToken });
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
