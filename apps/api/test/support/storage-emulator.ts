import { request } from 'node:http';

/** A resposta do emulador de storage a um `GET` de URL assinada. */
export interface SignedUrlResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

/**
 * `GET` de uma URL assinada no emulador de storage, no papel do navegador. O
 * contêiner da API não alcança o endereço público, e o emulador só serve a URL
 * com o `Host` dele, que o `fetch` não deixa definir: a requisição vai ao
 * `emulatorHost` (o `STORAGE_EMULATOR_HOST` da configuração injetada) com o
 * `Host` da URL assinada.
 */
export function getSignedUrlOnEmulator(
  emulatorHost: string | undefined,
  signedUrl: string,
): Promise<SignedUrlResponse> {
  if (!emulatorHost) {
    throw new Error(
      'STORAGE_EMULATOR_HOST não está definida. Suba o ambiente pelo Compose antes de rodar os testes.',
    );
  }
  const url = new URL(signedUrl);
  const emulator = new URL(emulatorHost);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: emulator.hostname,
        port: emulator.port,
        path: `${url.pathname}${url.search}`,
        headers: { Host: url.host },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}
