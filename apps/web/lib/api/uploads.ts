import "server-only";
import { apiRequest } from "@/lib/api/client";
import type {
  ApiResult,
  CreateUploadInput,
  Item,
  Upload,
} from "@/lib/api/types";

/* As rotas de envio (docs/lld.md, seção 3.4). */

/** Reserva o espaço e cria a sessão de envio. */
export function createUpload(
  accessToken: string,
  input: CreateUploadInput,
): Promise<ApiResult<Upload>> {
  return apiRequest("/uploads", { method: "POST", body: input, accessToken });
}

/** Confere o arquivo no storage e o torna visível na lista. */
export function completeUpload(
  accessToken: string,
  itemId: string,
): Promise<ApiResult<Item>> {
  return apiRequest(`/uploads/${encodeURIComponent(itemId)}/complete`, {
    method: "POST",
    accessToken,
  });
}
