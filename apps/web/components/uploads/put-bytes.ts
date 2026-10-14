/** Por que o envio dos bytes ao storage não terminou. Um `PUT` recusado e uma rede que cai não se distinguem para a pessoa. */
export type PutBytesResult = { ok: true } | { ok: false };

/**
 * Manda o arquivo ao endereço da sessão de envio, num único `PUT` (docs/lld.md, seção 7.4). Usa
 * `XMLHttpRequest` porque o `fetch` não informa o progresso do envio. O navegador monta o
 * `Content-Type` a partir do tipo do arquivo.
 */
export function putBytes(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<PutBytesResult> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open("PUT", uploadUrl);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onload = () => resolve({ ok: request.status < 300 });
    request.onerror = () => resolve({ ok: false });
    request.onabort = () => resolve({ ok: false });
    request.send(file);
  });
}
