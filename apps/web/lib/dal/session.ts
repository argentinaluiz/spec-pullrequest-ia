import "server-only";
import { redirect } from "next/navigation";
import type { ApiResult } from "@/lib/api/types";
import { LOGIN_PATH, SESSION_ENDED_PATH } from "@/lib/session/paths";
import { accessToken } from "@/lib/session/tokens";

/**
 * Chama a API com o token da Sessão. Sem token, leva à tela de entrar; recusado pela API, leva à
 * rota que encerra a Sessão, como o `getCurrentUser()`. Os outros erros voltam como valor, para
 * quem chama decidir.
 */
export async function withSession<T>(
  call: (token: string) => Promise<ApiResult<T>>,
): Promise<ApiResult<T>> {
  const token = await accessToken();
  if (!token) redirect(LOGIN_PATH);

  const result = await call(token);
  if (!result.ok && result.error.code === "unauthenticated") {
    redirect(SESSION_ENDED_PATH);
  }
  return result;
}
