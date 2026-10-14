"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { toFileRow } from "@/components/files/format";
import type { LoadMoreResult } from "@/components/files/load-more";
import * as authApi from "@/lib/api/auth";
import { errorMessage } from "@/lib/api/error-messages";
import type {
  CompleteUploadResult,
  StartUploadResult,
} from "@/components/uploads/types";
import { getRootItems } from "@/lib/dal/items";
import { finishUpload, startRootUpload } from "@/lib/dal/uploads";
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

/** A Server Action é um endpoint público: o que vem do navegador é conferido antes de ir à API. */
const startUploadSchema = z.object({
  name: z.string().min(1).max(255),
  sizeBytes: z.number().int().min(0),
  mimeType: z.string().max(255),
});

/**
 * Começa o envio de um arquivo para a Pasta raiz: a API reserva o espaço e devolve o endereço
 * para onde o navegador manda os bytes. A Sessão é conferida pela própria chamada à API.
 */
export async function startUpload(input: {
  name: string;
  sizeBytes: number;
  mimeType: string;
}): Promise<StartUploadResult> {
  const parsed = startUploadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: errorMessage("validation_error") };
  }
  const result = await startRootUpload(parsed.data);
  if (!result.ok) {
    return { ok: false, message: errorMessage(result.error.code) };
  }
  const { itemId, uploadUrl } = result.data;
  return { ok: true, itemId, uploadUrl };
}

/** Conclui o envio, depois de os bytes chegarem ao storage. */
export async function completeUpload(
  itemId: string,
): Promise<CompleteUploadResult> {
  const parsed = z.string().min(1).max(64).safeParse(itemId);
  if (!parsed.success) {
    return { ok: false, message: errorMessage("validation_error") };
  }
  const result = await finishUpload(parsed.data);
  if (!result.ok) {
    return { ok: false, message: errorMessage(result.error.code) };
  }
  return { ok: true };
}
