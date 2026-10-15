import "server-only";
import * as uploadsApi from "@/lib/api/uploads";
import type {
  ApiResult,
  CreateUploadInput,
  Item,
  Upload,
} from "@/lib/api/types";
import { withSession } from "@/lib/dal/session";

/** Inicia o envio de um arquivo para a pasta de destino (`root` ou o id de uma pasta). */
export function startUpload(
  input: CreateUploadInput,
): Promise<ApiResult<Upload>> {
  return withSession((token) => uploadsApi.createUpload(token, input));
}

/** Conclui o envio, depois de os bytes chegarem ao storage. */
export function finishUpload(itemId: string): Promise<ApiResult<Item>> {
  return withSession((token) => uploadsApi.completeUpload(token, itemId));
}

/** Cancela o envio: o upload pendente some e o espaço volta à Cota. */
export function discardUpload(itemId: string): Promise<ApiResult<void>> {
  return withSession((token) => uploadsApi.cancelUpload(token, itemId));
}
