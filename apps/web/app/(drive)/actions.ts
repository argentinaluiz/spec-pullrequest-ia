"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { toFileRow } from "@/components/files/format";
import type { LoadMoreResult } from "@/components/files/load-more";
import * as authApi from "@/lib/api/auth";
import { errorMessage } from "@/lib/api/error-messages";
import { getRootItems } from "@/lib/dal/items";
import { LOGIN_PATH } from "@/lib/session/paths";
import { clearSession, refreshToken } from "@/lib/session/tokens";

/**
 * Encerra a Sessão deste navegador. As outras Sessões do Usuário continuam. Sair funciona
 * mesmo se a API falhar ou a Sessão já tiver acabado: os cookies são apagados de todo jeito.
 */
export async function logout(): Promise<void> {
  const token = await refreshToken();
  if (token) {
    const result = await authApi.logout({ refreshToken: token });
    if (!result.ok) {
      // A pessoa sai deste navegador de todo jeito, mas a Sessão continua valendo na API.
      console.error(
        `A API não encerrou a Sessão no logout (${result.error.status} ${result.error.code}).`,
      );
    }
  }
  await clearSession();
  redirect(LOGIN_PATH);
}

/** O cursor é opaco e vem do navegador: a ação só confere que ele é um texto. */
const cursorSchema = z.string().min(1).max(2048);

/**
 * A página seguinte da Pasta raiz, já no formato das linhas da lista. A Sessão é conferida
 * de novo, pela própria listagem na API.
 */
export async function loadMoreRootItems(cursor: string): Promise<LoadMoreResult> {
  const parsed = cursorSchema.safeParse(cursor);
  if (!parsed.success) {
    return { ok: false, message: errorMessage("validation_error") };
  }
  const result = await getRootItems(parsed.data);
  if (!result.ok) {
    return { ok: false, message: errorMessage(result.error.code) };
  }
  return {
    ok: true,
    rows: result.data.items.map(toFileRow),
    nextCursor: result.data.nextCursor,
  };
}
