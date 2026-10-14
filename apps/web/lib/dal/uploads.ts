import "server-only";
import * as uploadsApi from "@/lib/api/uploads";
import type {
  ApiResult,
  CreateUploadInput,
  Item,
  Upload,
} from "@/lib/api/types";
import { withSession } from "@/lib/dal/session";

/** Inicia o envio de um arquivo para a Pasta raiz. */
export function startRootUpload(
  input: Omit<CreateUploadInput, "parentId">,
): Promise<ApiResult<Upload>> {
  return withSession((token) =>
    uploadsApi.createUpload(token, { ...input, parentId: "root" }),
  );
}

/** Conclui o envio, depois de os bytes chegarem ao storage. */
export function finishUpload(itemId: string): Promise<ApiResult<Item>> {
  return withSession((token) => uploadsApi.completeUpload(token, itemId));
}
