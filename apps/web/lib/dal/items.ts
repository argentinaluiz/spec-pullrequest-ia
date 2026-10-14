import "server-only";
import { listRootChildren } from "@/lib/api/items";
import type { ApiResult, ItemPage } from "@/lib/api/types";
import { withSession } from "@/lib/dal/session";

/**
 * Uma página da Pasta raiz do Usuário da Sessão. A conferência da Sessão é a da própria
 * listagem, por `withSession`, sem uma chamada a mais. Os outros erros voltam como valor, para
 * quem chama decidir: a página falha, e o "Carregar mais" mostra a mensagem.
 */
export function getRootItems(cursor?: string): Promise<ApiResult<ItemPage>> {
  return withSession((token) => listRootChildren(token, cursor));
}
