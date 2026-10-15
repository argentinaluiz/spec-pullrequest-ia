import { describe, expect, it, vi } from "vitest";
import { createUploadEngine } from "@/lib/uploads/engine";
import { panelTitle } from "@/lib/uploads/panel";
import type {
  CompleteUploadResult,
  PutRequest,
  PutResponse,
  UploadApi,
  UploadSleep,
  UploadStatus,
} from "@/lib/uploads/types";

const KiB = 1024;
const MiB = 1024 * KiB;

/** Uma sessão de upload falsa que responde como o storage: 308 com o `Range` do que recebeu, 200 no fim. */
class FakeStorage {
  received = 0;
  /** Quantos bytes de cada `PUT` com bytes o storage confirma, na ordem. Sem item, confirma todos. */
  confirmLimits: number[] = [];
  puts: { contentRange: string | null; size: number; url: string }[] = [];

  /** Responde ao `PUT` como o storage responderia. */
  respond(request: PutRequest): PutResponse {
    const size = request.body?.size ?? 0;
    this.puts.push({ contentRange: request.contentRange, size, url: request.url });
    const range = request.contentRange;
    if (range === null) return { status: 200, range: null };
    const query = /^bytes \*\/(\d+)$/.exec(range);
    if (query) return this.progress(Number(query[1]));
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range);
    if (!match) throw new Error(`Content-Range inesperado: ${range}`);
    const [start, end, total] = match.slice(1).map(Number);
    const limit = this.confirmLimits.shift();
    const confirmedEnd = limit === undefined ? end + 1 : Math.min(end + 1, start + limit);
    if (start <= this.received) this.received = Math.max(this.received, confirmedEnd);
    return this.progress(total);
  }

  private progress(total: number): PutResponse {
    if (this.received >= total) return { status: 200, range: null };
    return {
      status: 308,
      range: this.received > 0 ? `bytes=0-${this.received - 1}` : null,
    };
  }

  /** Só os `PUT` com bytes, sem as consultas de progresso. */
  get chunks(): string[] {
    return this.puts
      .filter((put) => !put.contentRange?.startsWith("bytes */"))
      .map((put) => put.contentRange ?? "");
  }
}

const file = (size: number, name = "arquivo.bin") =>
  new File([new Uint8Array(size)], name, { type: "application/octet-stream" });

function fakeApi() {
  let sessions = 0;
  const api = {
    start: vi.fn<UploadApi["start"]>(async () => {
      sessions += 1;
      return {
        ok: true,
        itemId: `item-${sessions}`,
        uploadUrl: `https://storage.test/session-${sessions}`,
      };
    }),
    complete: vi.fn<UploadApi["complete"]>(async () => ({ ok: true })),
    cancel: vi.fn<UploadApi["cancel"]>(async () => ({ ok: true })),
  };
  return api;
}

const instantSleep = () => vi.fn<UploadSleep>(async () => undefined);

function statusOf(engine: ReturnType<typeof createUploadEngine>, key: string) {
  return engine.getSnapshot().entries.find((entry) => entry.key === key)?.status;
}

async function waitForStatus(
  engine: ReturnType<typeof createUploadEngine>,
  key: string,
  status: UploadStatus,
) {
  await vi.waitFor(() => expect(statusOf(engine, key)).toBe(status));
}

/** Deixa o motor andar o que tiver para andar. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/** Um `PUT` que fica parado até ser abortado, como um chunk em curso. */
function hang(request: PutRequest): Promise<PutResponse> {
  return new Promise((_resolve, reject) => {
    request.signal.addEventListener("abort", () =>
      reject(new DOMException("Aborted", "AbortError")),
    );
  });
}

describe("motor de envio", () => {
  it("corta o arquivo em chunks de 8 MiB e envia o menor que um chunk num envio só @LUI-170-CA1", async () => {
    const storage = new FakeStorage();
    const engine = createUploadEngine({
      transport: async (request) => storage.respond(request),
      sleep: instantSleep(),
      api: fakeApi(),
    });

    const [large] = engine.add([file(20 * MiB)], "root");
    await waitForStatus(engine, large, "done");

    expect(storage.chunks).toEqual([
      "bytes 0-8388607/20971520",
      "bytes 8388608-16777215/20971520",
      "bytes 16777216-20971519/20971520",
    ]);
    expect(storage.puts.map((put) => put.size)).toEqual([
      8 * MiB,
      8 * MiB,
      4 * MiB,
    ]);

    const small = new FakeStorage();
    const smallEngine = createUploadEngine({
      transport: async (request) => small.respond(request),
      sleep: instantSleep(),
      api: fakeApi(),
    });
    const [key] = smallEngine.add([file(5 * MiB)], "root");
    await waitForStatus(smallEngine, key, "done");
    expect(small.chunks).toEqual(["bytes 0-5242879/5242880"]);

    const empty = new FakeStorage();
    const emptyEngine = createUploadEngine({
      transport: async (request) => empty.respond(request),
      sleep: instantSleep(),
      api: fakeApi(),
    });
    const [emptyKey] = emptyEngine.add([file(0)], "root");
    await waitForStatus(emptyEngine, emptyKey, "done");
    expect(empty.puts).toEqual([
      { contentRange: null, size: 0, url: "https://storage.test/session-1" },
    ]);
  });

  it("calcula o próximo chunk pelo que o storage confirmou, e não pelo que enviou @LUI-170-CA2", async () => {
    const storage = new FakeStorage();
    storage.confirmLimits = [4 * MiB];
    const engine = createUploadEngine({
      transport: async (request) => storage.respond(request),
      sleep: instantSleep(),
      api: fakeApi(),
    });

    const [key] = engine.add([file(20 * MiB)], "root");
    const progress: number[] = [];
    engine.subscribe(() => progress.push(engine.getSnapshot().entries[0].progress));
    await waitForStatus(engine, key, "done");

    expect(storage.chunks.slice(0, 2)).toEqual([
      "bytes 0-8388607/20971520",
      "bytes 4194304-12582911/20971520",
    ]);
    // 4 MiB de 20 MiB confirmados: 20%, e não os 40% que o navegador já tinha mandado.
    expect(progress).toContain(20);
    expect(progress).not.toContain(40);
  });

  it("repete o chunk que falhou depois de consultar o progresso, até 5 vezes com espera crescente, e falha o arquivo @LUI-170-CA3", async () => {
    const storage = new FakeStorage();
    const secondChunk = "bytes 8388608-9437183/9437184";
    const outcomes: ("network" | 503 | "ok")[] = ["network", 503, "ok"];
    const sleep = instantSleep();
    const api = fakeApi();
    const engine = createUploadEngine({
      transport: async (request) => {
        if (request.contentRange === secondChunk) {
          const outcome = outcomes.shift() ?? "ok";
          if (outcome !== "ok") {
            storage.puts.push({ contentRange: request.contentRange, size: 0, url: request.url });
          }
          if (outcome === "network") throw new TypeError("Failed to fetch");
          if (outcome === 503) return { status: 503, range: null };
        }
        return storage.respond(request);
      },
      sleep,
      api,
    });

    const [key] = engine.add([file(9 * MiB)], "root");
    await waitForStatus(engine, key, "done");

    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000]);
    // Depois de cada espera, a consulta de progresso, e só então o chunk de novo.
    expect(storage.puts.map((put) => put.contentRange)).toEqual([
      "bytes 0-8388607/9437184",
      secondChunk,
      "bytes */9437184",
      secondChunk,
      "bytes */9437184",
      secondChunk,
    ]);

    const broken = new FakeStorage();
    const brokenSleep = instantSleep();
    const brokenApi = fakeApi();
    const brokenEngine = createUploadEngine({
      transport: async (request) => {
        if (request.contentRange === secondChunk) throw new TypeError("Failed to fetch");
        return broken.respond(request);
      },
      sleep: brokenSleep,
      api: brokenApi,
    });

    const [brokenKey] = brokenEngine.add([file(9 * MiB)], "root");
    await waitForStatus(brokenEngine, brokenKey, "failed");

    expect(brokenSleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 4000, 8000, 16000]);
    expect(brokenApi.complete).not.toHaveBeenCalled();
    expect(brokenEngine.getSnapshot().entries[0].message).toBe(
      "A conexão falhou durante o envio",
    );
  });

  it("com a sessão expirada, cancela o upload e recomeça do zero numa sessão nova @LUI-170-CA4", async () => {
    for (const expiredStatus of [404, 410]) {
      const storage = new FakeStorage();
      const api = fakeApi();
      const engine = createUploadEngine({
        transport: async (request) =>
          request.url.endsWith("session-1")
            ? { status: expiredStatus, range: null }
            : storage.respond(request),
        sleep: instantSleep(),
        api,
      });

      const [key] = engine.add([file(9 * MiB)], "root");
      await waitForStatus(engine, key, "done");

      expect(api.cancel).toHaveBeenCalledExactlyOnceWith("item-1");
      expect(api.start).toHaveBeenCalledTimes(2);
      expect(storage.puts.map((put) => [put.url, put.contentRange])).toEqual([
        ["https://storage.test/session-2", "bytes 0-8388607/9437184"],
        ["https://storage.test/session-2", "bytes 8388608-9437183/9437184"],
      ]);
      expect(api.complete).toHaveBeenCalledExactlyOnceWith("item-2");
    }
  });

  it("um upload_incomplete na conclusão faz o motor consultar o progresso e retomar @LUI-170-CA5", async () => {
    const incomplete: CompleteUploadResult = {
      ok: false,
      message: "O envio ainda não terminou.",
      incomplete: true,
    };

    // O storage já tem tudo quando a consulta chega: nada a enviar.
    const whole = new FakeStorage();
    const wholeApi = fakeApi();
    wholeApi.complete.mockResolvedValueOnce(incomplete);
    const wholeEngine = createUploadEngine({
      transport: async (request) => whole.respond(request),
      sleep: instantSleep(),
      api: wholeApi,
    });
    const [wholeKey] = wholeEngine.add([file(9 * MiB)], "root");
    await waitForStatus(wholeEngine, wholeKey, "done");
    expect(whole.puts.map((put) => put.contentRange)).toEqual([
      "bytes 0-8388607/9437184",
      "bytes 8388608-9437183/9437184",
      "bytes */9437184",
    ]);
    expect(wholeApi.complete).toHaveBeenCalledTimes(2);

    // O storage perdeu o último chunk: o motor manda só o que faltou.
    const partial = new FakeStorage();
    const partialApi = fakeApi();
    partialApi.complete.mockImplementationOnce(async () => {
      partial.received = 8 * MiB;
      return incomplete;
    });
    const states: UploadStatus[] = [];
    const partialEngine = createUploadEngine({
      transport: async (request) => partial.respond(request),
      sleep: instantSleep(),
      api: partialApi,
    });
    partialEngine.subscribe(() =>
      states.push(partialEngine.getSnapshot().entries[0].status),
    );
    const [partialKey] = partialEngine.add([file(9 * MiB)], "root");
    await waitForStatus(partialEngine, partialKey, "done");
    expect(partial.puts.map((put) => put.contentRange)).toEqual([
      "bytes 0-8388607/9437184",
      "bytes 8388608-9437183/9437184",
      "bytes */9437184",
      "bytes 8388608-9437183/9437184",
    ]);
    expect(partialApi.complete).toHaveBeenCalledTimes(2);
    expect(states).not.toContain("failed");
  });

  it("envia no máximo 3 arquivos ao mesmo tempo e começa o próximo da fila quando um termina @LUI-170-CA6", async () => {
    const held: { url: string; release: () => void }[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const engine = createUploadEngine({
      transport: (request) =>
        new Promise((resolve) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          held.push({
            url: request.url,
            release: () => {
              inFlight -= 1;
              resolve({ status: 200, range: null });
            },
          });
        }),
      sleep: instantSleep(),
      api: fakeApi(),
    });

    const keys = engine.add(
      Array.from({ length: 5 }, (_, index) => file(MiB, `arquivo-${index}.bin`)),
      "root",
    );

    await vi.waitFor(() => expect(held).toHaveLength(3));
    expect(held.map((put) => put.url)).toEqual([
      "https://storage.test/session-1",
      "https://storage.test/session-2",
      "https://storage.test/session-3",
    ]);
    expect(panelTitle(engine.getSnapshot().entries)).toBe("Enviando 3 de 5");

    held[0].release();
    await waitForStatus(engine, keys[0], "done");
    await vi.waitFor(() => expect(held).toHaveLength(4));
    expect(panelTitle(engine.getSnapshot().entries)).toBe("Enviando 3 de 5");

    held.slice(1).forEach((put) => put.release());
    await vi.waitFor(() => expect(held).toHaveLength(5));
    held.slice(4).forEach((put) => put.release());
    await waitForStatus(engine, keys[4], "done");
    expect(maxInFlight).toBe(3);
  });

  it("pausar aborta o chunk em curso, e retomar continua do byte que o storage confirmou @LUI-170-CA7", async () => {
    const storage = new FakeStorage();
    const secondChunk = "bytes 8388608-16777215/17825792";
    let secondChunkAborted = false;
    let hangSecondChunk = true;
    const engine = createUploadEngine({
      transport: (request) => {
        if (request.contentRange === secondChunk && hangSecondChunk) {
          hangSecondChunk = false;
          storage.puts.push({ contentRange: secondChunk, size: 0, url: request.url });
          return new Promise((_resolve, reject) => {
            request.signal.addEventListener("abort", () => {
              secondChunkAborted = true;
              reject(new DOMException("Aborted", "AbortError"));
            });
          });
        }
        return Promise.resolve(storage.respond(request));
      },
      sleep: instantSleep(),
      api: fakeApi(),
    });

    const [key] = engine.add([file(17 * MiB)], "root");
    await vi.waitFor(() => expect(storage.puts).toHaveLength(2));

    engine.pause(key);
    await vi.waitFor(() => expect(secondChunkAborted).toBe(true));
    expect(statusOf(engine, key)).toBe("paused");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(storage.puts).toHaveLength(2);
    expect(statusOf(engine, key)).toBe("paused");

    engine.resume(key);
    await waitForStatus(engine, key, "done");
    expect(storage.puts.slice(2).map((put) => put.contentRange)).toEqual([
      "bytes */17825792",
      secondChunk,
      "bytes 16777216-17825791/17825792",
    ]);
  });

  it("depois de três sessões expiradas seguidas, o arquivo falha em vez de recomeçar de novo", async () => {
    const api = fakeApi();
    const engine = createUploadEngine({
      transport: async () => ({ status: 404, range: null }),
      sleep: instantSleep(),
      api,
    });

    const [key] = engine.add([file(MiB)], "root");
    await waitForStatus(engine, key, "failed");

    expect(api.start).toHaveBeenCalledTimes(4);
    expect(api.cancel.mock.calls).toEqual([["item-1"], ["item-2"], ["item-3"]]);
    expect(api.complete).not.toHaveBeenCalled();
  });

  it("tentar de novo continua na mesma sessão o arquivo que falhou por conexão, e não repete o que a API recusou", async () => {
    const refusedApi = fakeApi();
    refusedApi.start.mockResolvedValueOnce({
      ok: false,
      message: "Não há espaço na sua cota para este arquivo",
    });
    const refusedEngine = createUploadEngine({
      transport: async () => ({ status: 200, range: null }),
      sleep: instantSleep(),
      api: refusedApi,
    });
    const [refused] = refusedEngine.add([file(10)], "root");
    await waitForStatus(refusedEngine, refused, "failed");
    refusedEngine.retry(refused);
    await settle();
    expect(statusOf(refusedEngine, refused)).toBe("failed");
    expect(refusedApi.start).toHaveBeenCalledOnce();

    const storage = new FakeStorage();
    const secondChunk = "bytes 8388608-9437183/9437184";
    let failing = true;
    const api = fakeApi();
    const engine = createUploadEngine({
      transport: async (request) => {
        if (request.contentRange === secondChunk && failing) {
          throw new TypeError("Failed to fetch");
        }
        return storage.respond(request);
      },
      sleep: instantSleep(),
      api,
    });
    const [key] = engine.add([file(9 * MiB)], "root");
    await waitForStatus(engine, key, "failed");

    failing = false;
    const before = storage.puts.length;
    engine.retry(key);
    await waitForStatus(engine, key, "done");
    expect(storage.puts.slice(before).map((put) => put.contentRange)).toEqual([
      "bytes */9437184",
      secondChunk,
    ]);
    expect(api.start).toHaveBeenCalledOnce();
    expect(api.complete).toHaveBeenCalledExactlyOnceWith("item-1");
  });

  it("cancelar tira o arquivo do painel e cancela o upload na API, com o chunk em curso, antes de a sessão existir ou pausado", async () => {
    // Com um chunk em curso: o `PUT` é abortado e nenhum outro sai.
    const puts: PutRequest[] = [];
    const sendingApi = fakeApi();
    const sending = createUploadEngine({
      transport: (request) => {
        puts.push(request);
        return hang(request);
      },
      sleep: instantSleep(),
      api: sendingApi,
    });
    const [sendingKey] = sending.add([file(9 * MiB)], "root");
    await vi.waitFor(() => expect(puts).toHaveLength(1));
    sending.cancel(sendingKey);
    expect(sending.getSnapshot().entries).toEqual([]);
    expect(puts[0].signal.aborted).toBe(true);
    await vi.waitFor(() =>
      expect(sendingApi.cancel).toHaveBeenCalledExactlyOnceWith("item-1"),
    );
    await settle();
    expect(puts).toHaveLength(1);
    expect(sendingApi.complete).not.toHaveBeenCalled();

    // Antes de a API devolver a sessão: o upload que ela criar é cancelado assim que chega.
    let answerStart = () => {};
    const startingApi = fakeApi();
    startingApi.start.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answerStart = () =>
            resolve({ ok: true, itemId: "item-1", uploadUrl: "https://storage.test/session-1" });
        }),
    );
    const startingTransport = vi.fn(async () => ({ status: 200, range: null }));
    const starting = createUploadEngine({
      transport: startingTransport,
      sleep: instantSleep(),
      api: startingApi,
    });
    const [startingKey] = starting.add([file(10)], "root");
    await vi.waitFor(() => expect(startingApi.start).toHaveBeenCalledOnce());
    starting.cancel(startingKey);
    answerStart();
    await vi.waitFor(() =>
      expect(startingApi.cancel).toHaveBeenCalledExactlyOnceWith("item-1"),
    );
    expect(startingTransport).not.toHaveBeenCalled();

    // Pausado: o upload continua `pending` até o cancelamento.
    const pausedApi = fakeApi();
    const pausedPuts: PutRequest[] = [];
    const paused = createUploadEngine({
      transport: (request) => {
        pausedPuts.push(request);
        return hang(request);
      },
      sleep: instantSleep(),
      api: pausedApi,
    });
    const [pausedKey] = paused.add([file(9 * MiB)], "root");
    await vi.waitFor(() => expect(pausedPuts).toHaveLength(1));
    paused.pause(pausedKey);
    await settle();
    expect(pausedApi.cancel).not.toHaveBeenCalled();
    paused.cancel(pausedKey);
    expect(paused.getSnapshot().entries).toEqual([]);
    await vi.waitFor(() =>
      expect(pausedApi.cancel).toHaveBeenCalledExactlyOnceWith("item-1"),
    );
  });

  it("cancelar durante a conclusão cancela o upload na API na hora, e o arquivo não conta como concluído", async () => {
    let answerComplete: (result: CompleteUploadResult) => void = () => {};
    const api = fakeApi();
    api.complete.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answerComplete = resolve;
        }),
    );
    const onDone = vi.fn();
    const engine = createUploadEngine({
      transport: async () => ({ status: 200, range: null }),
      sleep: instantSleep(),
      api,
      onDone,
    });
    const [key] = engine.add([file(10)], "root");
    await vi.waitFor(() => expect(api.complete).toHaveBeenCalledOnce());

    engine.cancel(key);

    await vi.waitFor(() => expect(api.cancel).toHaveBeenCalledExactlyOnceWith("item-1"));
    // O cancelamento ganhou na API: a conclusão encontra o upload apagado.
    answerComplete({ ok: false, message: "O item não existe.", incomplete: false });
    await settle();
    expect(engine.getSnapshot().entries).toEqual([]);
    expect(onDone).not.toHaveBeenCalled();
    expect(api.cancel).toHaveBeenCalledOnce();
  });

  it("tirar do painel um arquivo que falhou com a sessão aberta cancela o upload na API", async () => {
    const api = fakeApi();
    const engine = createUploadEngine({
      transport: async () => {
        throw new TypeError("Failed to fetch");
      },
      sleep: instantSleep(),
      api,
    });
    const [dismissed, cleared] = engine.add([file(10), file(20)], "root");
    await waitForStatus(engine, dismissed, "failed");
    await waitForStatus(engine, cleared, "failed");

    engine.dismiss(dismissed);
    engine.clearFinished();

    await vi.waitFor(() =>
      expect(api.cancel.mock.calls.map(([itemId]) => itemId).sort()).toEqual([
        "item-1",
        "item-2",
      ]),
    );
    expect(engine.getSnapshot().entries).toEqual([]);
  });

  it("tirar do painel um arquivo concluído não chama o cancelamento", async () => {
    const api = fakeApi();
    const engine = createUploadEngine({
      transport: async () => ({ status: 200, range: null }),
      sleep: instantSleep(),
      api,
    });
    const [key] = engine.add([file(10)], "root");
    await waitForStatus(engine, key, "done");

    engine.dismiss(key);
    await settle();

    expect(api.cancel).not.toHaveBeenCalled();
  });

  it("um chunk que o storage responde com 308 sem confirmar bytes novos conta como falha, e o arquivo falha depois das 5 tentativas", async () => {
    const sleep = instantSleep();
    const api = fakeApi();
    const engine = createUploadEngine({
      transport: async () => ({ status: 308, range: null }),
      sleep,
      api,
    });

    const [key] = engine.add([file(MiB)], "root");
    await waitForStatus(engine, key, "failed");

    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 4000, 8000, 16000]);
    expect(engine.getSnapshot().entries[0].message).toBe("A conexão falhou durante o envio");
    expect(api.complete).not.toHaveBeenCalled();
  });

  it("o arquivo vazio fica em 0% até o storage guardá-lo, e então vai a 100%", async () => {
    const responses: PutResponse[] = [{ status: 308, range: null }];
    const engine = createUploadEngine({
      transport: async () => responses.shift() ?? { status: 200, range: null },
      sleep: instantSleep(),
      api: fakeApi(),
    });
    const progress: number[] = [];
    engine.subscribe(() => progress.push(engine.getSnapshot().entries[0].progress));

    const [key] = engine.add([file(0)], "root");
    await waitForStatus(engine, key, "done");

    expect(progress.every((value) => value === 0 || value === 100)).toBe(true);
    expect(progress.at(-1)).toBe(100);
  });

  it("com todos os bytes confirmados por uma 308, fecha a sessão com o PUT vazio de bytes */<total>, sem montar um chunk vazio", async () => {
    const puts: (string | null)[] = [];
    const api = fakeApi();
    const engine = createUploadEngine({
      transport: async (request) => {
        puts.push(request.contentRange);
        // O storage recebeu tudo, mas só fecha o objeto no pedido final.
        if (request.contentRange === "bytes */1048576") return { status: 201, range: null };
        return { status: 308, range: "bytes=0-1048575" };
      },
      sleep: instantSleep(),
      api,
    });

    const [key] = engine.add([file(MiB)], "root");
    await waitForStatus(engine, key, "done");

    expect(puts).toEqual(["bytes 0-1048575/1048576", "bytes */1048576"]);
    expect(api.complete).toHaveBeenCalledExactlyOnceWith("item-1");
  });

  it("parar o motor aborta o envio em curso, esvazia a fila e deixa os uploads pendentes na API", async () => {
    const puts: PutRequest[] = [];
    const api = fakeApi();
    const engine = createUploadEngine({
      transport: (request) => {
        puts.push(request);
        return hang(request);
      },
      sleep: instantSleep(),
      api,
      concurrency: 1,
    });
    engine.add([file(MiB, "enviando.bin"), file(MiB, "na-fila.bin")], "root");
    await vi.waitFor(() => expect(puts).toHaveLength(1));

    engine.stop();
    await settle();

    expect(puts[0].signal.aborted).toBe(true);
    expect(puts).toHaveLength(1);
    expect(api.start).toHaveBeenCalledOnce();
    expect(api.cancel).not.toHaveBeenCalled();
    expect(engine.getSnapshot().entries).toEqual([]);
  });
});
