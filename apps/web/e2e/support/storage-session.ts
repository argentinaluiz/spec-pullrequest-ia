import type { Page, Request, Route } from "@playwright/test";

// O auxiliar dos testes de envio em chunks. O que ele cobre do emulador, e por quê, está no
// docs/lld.md, seção 4.6 ("Como os testes no navegador cobrem as duas lacunas").

const SESSION_PATH = /\/upload\/storage\/v1\/b\/[^/]+\/o\?.*upload_id=/;

/** O que identifica um chunk: o tamanho total do arquivo e o byte em que o chunk começa. */
export interface ChunkMatch {
  total: number;
  start: number;
}

export interface HeldChunk {
  /** Resolve quando o chunk chegou ao auxiliar e está parado. */
  reached: Promise<void>;
  /** Solta o chunk. Se o navegador já o abortou (pausa ou cancelamento), ele não segue ao emulador. */
  release: () => void;
}

export interface StorageSession {
  /** Faz o próximo `PUT` do chunk falhar por rede, uma vez. */
  failOnce: (chunk: ChunkMatch) => void;
  /** Segura o próximo `PUT` do chunk até `release()`. */
  hold: (chunk: ChunkMatch) => HeldChunk;
  /** Os `Content-Range` dos `PUT` que chegaram, na ordem, com os de consulta de progresso. */
  readonly requests: string[];
}

interface Pending {
  chunk: ChunkMatch;
  action: "fail" | "hold";
  held?: { reach: () => void; released: Promise<void> };
}

const parseChunk = (range: string | undefined) => {
  const match = range ? /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range) : null;
  return match
    ? { start: Number(match[1]), end: Number(match[2]), total: Number(match[3]) }
    : null;
};

/** O endereço que o Node alcança: `localhost` (o do navegador) vira o serviço `storage`. */
function nodeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hostname = "storage";
  return parsed.toString();
}

export async function interceptStorageSession(page: Page): Promise<StorageSession> {
  const confirmed = new Map<string, number>();
  const pending: Pending[] = [];
  const requests: string[] = [];
  const aborted = new WeakSet<Request>();
  page.on("requestfailed", (request) => aborted.add(request));

  const take = (chunk: { start: number; total: number }) => {
    const index = pending.findIndex(
      ({ chunk: wanted }) => wanted.start === chunk.start && wanted.total === chunk.total,
    );
    return index === -1 ? undefined : pending.splice(index, 1)[0];
  };

  async function forward(route: Route, uploadId: string, chunkEnd?: number) {
    const request = route.request();
    const url = new URL(request.url());
    const response = await route.fetch({
      url: nodeUrl(request.url()),
      // O emulador monta o endereço da sessão e confere o `Host` com o público dele.
      headers: { ...request.headers(), host: url.host },
    });
    const headers = { ...response.headers() };
    headers["access-control-expose-headers"] = "Range, Location";
    if (response.status() === 308 && chunkEnd !== undefined) {
      confirmed.set(uploadId, chunkEnd + 1);
      headers["range"] = `bytes=0-${chunkEnd}`;
    }
    await route.fulfill({ response, headers });
  }

  await page.route(SESSION_PATH, async (route) => {
    const request = route.request();
    if (request.method() !== "PUT") return route.fallback();
    const url = new URL(request.url());
    const uploadId = url.searchParams.get("upload_id") ?? "";
    const contentRange = request.headers()["content-range"];
    requests.push(contentRange ?? "(sem Content-Range)");

    const query = contentRange ? /^bytes \*\/(\d+)$/.exec(contentRange) : null;
    if (query) {
      // O emulador encerraria o envio nesta consulta: quem responde é o auxiliar.
      const received = confirmed.get(uploadId) ?? 0;
      const headers: Record<string, string> = {
        "access-control-allow-origin": request.headers()["origin"] ?? "*",
        "access-control-expose-headers": "Range, Location",
      };
      if (received > 0) headers["range"] = `bytes=0-${received - 1}`;
      return route.fulfill({ status: 308, headers });
    }

    const chunk = parseChunk(contentRange);
    const planned = chunk && take(chunk);
    if (planned?.action === "fail") return route.abort("failed");
    if (planned?.action === "hold" && planned.held) {
      planned.held.reach();
      await planned.held.released;
      // Pausa ou cancelamento: o navegador já abortou o pedido, e o chunk não segue.
      if (aborted.has(request)) return route.abort("failed").catch(() => undefined);
    }
    return forward(route, uploadId, chunk?.end);
  });

  return {
    requests,
    failOnce: (chunk) => {
      pending.push({ chunk, action: "fail" });
    },
    hold: (chunk) => {
      let reach = () => {};
      let release = () => {};
      const reached = new Promise<void>((resolve) => (reach = resolve));
      const released = new Promise<void>((resolve) => (release = resolve));
      pending.push({ chunk, action: "hold", held: { reach, released } });
      return { reached, release };
    },
  };
}
