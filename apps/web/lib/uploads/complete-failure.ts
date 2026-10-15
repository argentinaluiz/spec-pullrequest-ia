import type { ApiErrorCode } from "@/lib/api/types";
import type { CompleteFailureReason } from "@/lib/uploads/types";

/**
 * O que a falha da conclusão diz da sessão (docs/lld.md, seção 7.4): o upload que a API apagou
 * (`upload_size_mismatch`) ou que não existe mais (`not_found`: cancelado ou removido pela limpeza)
 * descarta a sessão; o `upload_incomplete` pede a consulta de progresso; o `internal_error` e o
 * `rate_limited` repetem a conclusão na mesma sessão; qualquer outro código encerra o envio, sem
 * nova tentativa.
 */
export function completeFailureReason(code: ApiErrorCode): CompleteFailureReason {
  switch (code) {
    case "upload_size_mismatch":
    case "not_found":
      return "discarded";
    case "upload_incomplete":
      return "incomplete";
    case "internal_error":
    case "rate_limited":
      return "retryable";
    default:
      return "terminal";
  }
}
