import type {
  PutRequest,
  PutResponse,
  UploadSleep,
  UploadTransport,
} from "@/lib/uploads/types";

/**
 * O transporte do navegador: um `PUT` à sessão de upload do storage (docs/lld.md, seção 7.4),
 * com o `Content-Range` do chunk. O `Range` da 308 volta para o motor, que calcula o próximo
 * chunk por ele. Uma falha de rede sai como exceção.
 */
export const fetchTransport: UploadTransport = async ({
  url,
  contentRange,
  body,
  signal,
}: PutRequest): Promise<PutResponse> => {
  const response = await fetch(url, {
    method: "PUT",
    headers: contentRange ? { "Content-Range": contentRange } : undefined,
    body,
    signal,
  });
  return { status: response.status, range: response.headers.get("Range") };
};

/** O relógio do navegador: espera `ms`, ou sai antes quando o sinal dispara. */
export const timerSleep: UploadSleep = (ms, signal) =>
  new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done);
  });
