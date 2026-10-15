import {
  createServer,
  request,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { requireEmulatorHost } from './storage-emulator.js';

/** Um pedido segurado pelo proxy: `reached` resolve quando ele chega, e `release` o deixa seguir. */
export interface HeldRequest {
  reached: Promise<void>;
  release: () => void;
}

/** Um proxy até o emulador de storage, que pode segurar ou recusar um pedido no meio do caminho. Cada teste sobe o seu e o fecha no fim. */
export interface StorageProxy {
  /** O endereço do proxy, para o `STORAGE_EMULATOR_HOST` de uma aplicação de teste. */
  url: string;
  /** Segura o próximo pedido com o método `method` até `release()`. */
  holdNext: (method: string) => HeldRequest;
  /**
   * Responde `status` (503, se omitido) ao próximo pedido com o método
   * `method`, sem repassá-lo ao emulador. O SDK não repete o `DELETE` de um
   * objeto sem pré-condição, então cada chamada é uma falha só.
   */
  failNext: (method: string, status?: number) => void;
  close: () => Promise<void>;
}

interface Hold {
  method: string;
  reach: () => void;
  released: Promise<void>;
}

/**
 * Sobe, no próprio contêiner, um servidor que repassa cada pedido ao emulador
 * de storage (`emulatorHost`, o `STORAGE_EMULATOR_HOST` da configuração
 * injetada). Quem o recebe é o emulador real; o proxy só controla quando um
 * pedido chega a ele, ou o recusa, para o teste pôr outra chamada no meio de
 * uma operação do storage ou provocar uma falha dele.
 */
export async function startStorageProxy(
  emulatorHost: string | undefined,
): Promise<StorageProxy> {
  const target = requireEmulatorHost(emulatorHost);
  const pendingHolds: Hold[] = [];
  const failures: { method: string; status: number }[] = [];

  const forward = (incoming: IncomingMessage, outgoing: ServerResponse) => {
    const upstream = request(
      {
        hostname: target.hostname,
        port: target.port,
        method: incoming.method,
        path: incoming.url,
        headers: { ...incoming.headers, host: target.host },
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      },
    );
    upstream.on('error', () => outgoing.destroy());
    incoming.pipe(upstream);
  };

  const server = createServer((incoming, outgoing) => {
    const failure = failures.findIndex(
      ({ method }) => method === incoming.method,
    );
    if (failure !== -1) {
      const [{ status }] = failures.splice(failure, 1);
      incoming.resume();
      outgoing.writeHead(status).end();
      return;
    }
    const index = pendingHolds.findIndex(
      (hold) => hold.method === incoming.method,
    );
    if (index === -1) {
      forward(incoming, outgoing);
      return;
    }
    const [hold] = pendingHolds.splice(index, 1);
    hold.reach();
    void hold.released.then(() => forward(incoming, outgoing));
  });
  const { promise: listening, resolve: listened } =
    Promise.withResolvers<void>();
  server.listen(0, '127.0.0.1', listened);
  await listening;
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    holdNext: (method) => {
      const reached = Promise.withResolvers<void>();
      const released = Promise.withResolvers<void>();
      pendingHolds.push({
        method,
        reach: reached.resolve,
        released: released.promise,
      });
      return { reached: reached.promise, release: released.resolve };
    },
    failNext: (method, status = 503) => {
      failures.push({ method, status });
    },
    close: () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      server.closeAllConnections();
      server.close((error) => (error ? reject(error) : resolve()));
      return promise;
    },
  };
}
