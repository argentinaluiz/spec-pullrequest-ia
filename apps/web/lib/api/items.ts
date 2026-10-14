import "server-only";
import { apiRequest } from "@/lib/api/client";
import type { ApiResult, ItemPage } from "@/lib/api/types";

/* As rotas de Itens (docs/lld.md, seção 3.3). */

/** Uma página dos Itens ativos da Pasta raiz. Sem `limit`, a API usa 50. */
export function listRootChildren(
  accessToken: string,
  { limit, cursor }: { limit?: number; cursor?: string } = {},
): Promise<ApiResult<ItemPage>> {
  const query = new URLSearchParams();
  if (limit !== undefined) query.set("limit", String(limit));
  if (cursor) query.set("cursor", cursor);
  const search = query.size > 0 ? `?${query}` : "";
  return apiRequest(`/items/root/children${search}`, { accessToken });
}
