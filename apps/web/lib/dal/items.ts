import "server-only";
import { redirect } from "next/navigation";
import { listRootChildren } from "@/lib/api/items";
import type { ApiResult, ItemPage } from "@/lib/api/types";
import { LOGIN_PATH, SESSION_ENDED_PATH } from "@/lib/session/paths";
import { accessToken } from "@/lib/session/tokens";

/**
 * Uma página da Pasta raiz do Usuário da Sessão. A conferência da Sessão é a da própria
 * listagem: a API recusa o token como recusaria no `GET /me`, e a reação é a mesma do
 * `getCurrentUser()`, sem uma chamada a mais. Os outros erros voltam como valor, para quem
 * chama decidir: a página falha, e o "Carregar mais" mostra a mensagem.
 */
export async function getRootItems(
  cursor?: string,
): Promise<ApiResult<ItemPage>> {
  const token = await accessToken();
  if (!token) redirect(LOGIN_PATH);

  const result = await listRootChildren(token, cursor);
  if (!result.ok && result.error.code === "unauthenticated") {
    redirect(SESSION_ENDED_PATH);
  }
  return result;
}
