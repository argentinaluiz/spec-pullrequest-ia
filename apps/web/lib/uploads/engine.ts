import type {
  PutRequest,
  PutResponse,
  UploadApi,
  UploadEntry,
  UploadFailure,
  UploadSleep,
  UploadSnapshot,
  UploadTransport,
} from "@/lib/uploads/types";

/** O Cloud Storage exige chunks múltiplos de 256 KiB, menos o último (docs/lld.md, seção 7.4). */
const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;
const DEFAULT_CONCURRENCY = 3;
/** A espera antes de cada nova tentativa: dobra a cada uma e fica abaixo do teto de 30 s. */
const RETRY_WAIT_MS = [1000, 2000, 4000, 8000, 16000];
/** Quantas vezes uma sessão expirada recomeça o arquivo do zero, antes de o envio falhar. */
const MAX_RESTARTS = 3;

const CONNECTION_FAILED = "A conexão falhou durante o envio";

/** O painel sem nenhum envio. */
export const INITIAL_SNAPSHOT: UploadSnapshot = { entries: [] };

/** O envio terminou, concluído ou com falha: só sai do painel quando a pessoa o tira. */
export function isFinished(entry: UploadEntry): boolean {
  return entry.status === "done" || entry.status === "failed";
}

/** Só a falha que pode dar certo numa nova tentativa oferece "Tentar de novo". */
export function canRetry(entry: UploadEntry): boolean {
  return entry.status === "failed" && entry.failure !== "rejected";
}

export interface UploadEngineOptions {
  transport: UploadTransport;
  sleep: UploadSleep;
  api: UploadApi;
  concurrency?: number;
  chunkSize?: number;
  /** Chamado quando um arquivo termina concluído (a tela atualiza a lista e a Cota). */
  onDone?: (entry: UploadEntry) => void;
}

interface Run {
  task: Task;
  file: File;
  /** Dispara quando a pessoa pausa ou cancela: só esta execução do arquivo para. */
  signal: AbortSignal;
}

/** O arquivo parou por pausa ou cancelamento, e não por erro. */
class Interrupted extends Error {}
/** A sessão de upload acabou (404 ou 410): é preciso cancelar o upload e começar outro. */
class SessionExpired extends Error {}
/** Uma falha que repetir o passo não resolve. */
class Failed extends Error {
  constructor(
    readonly failure: UploadFailure,
    message: string,
  ) {
    super(message);
  }
}

interface Task {
  entry: UploadEntry;
  /** O arquivo local, até não haver mais o que enviar dele (concluído ou recusado pela API). */
  file: File | null;
  parentId: string;
  /** A sessão em curso, depois de a API aceitar o início. */
  session: { itemId: string; uploadUrl: string } | null;
  /** O storage confirmou até aqui. */
  confirmed: number;
  /** O storage respondeu 200 ou 201: tem o arquivo inteiro. */
  stored: boolean;
  controller: AbortController;
  running: boolean;
  restarts: number;
  /** A conclusão foi pedida à API e ainda não respondeu. */
  completing: boolean;
  /** A pessoa cancelou o envio: o upload é desfeito na API. */
  cancelled: boolean;
}

export type UploadEngine = ReturnType<typeof createUploadEngine>;

/**
 * O motor de envio: a fila, os chunks, as tentativas, a pausa e o cancelamento (docs/lld.md,
 * seção 7.4). Não conhece React nem a rede: o transporte, o relógio e as ações da API entram
 * por parâmetro. A tela o lê por `subscribe` e `getSnapshot`.
 */
export function createUploadEngine(options: UploadEngineOptions) {
  const { transport, api, sleep } = options;
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  let tasks: Task[] = [];
  let running = 0;
  let snapshot = INITIAL_SNAPSHOT;
  const listeners = new Set<() => void>();
  let nextKey = 0;

  function publish() {
    snapshot = { entries: tasks.map((task) => task.entry) };
    listeners.forEach((listener) => listener());
  }

  function change(task: Task, patch: Partial<UploadEntry>) {
    task.entry = { ...task.entry, ...patch };
    publish();
  }

  /** Começa os arquivos da fila enquanto houver vaga. */
  function pump() {
    for (const task of tasks) {
      if (running >= concurrency) return;
      if (task.entry.status === "queued" && !task.running && task.file) {
        task.running = true;
        running += 1;
        void execute(task, task.file);
      }
    }
  }

  function find(key: string): Task | undefined {
    return tasks.find((task) => task.entry.key === key);
  }

  function interruptIfStopped(run: Run) {
    if (run.signal.aborted) throw new Interrupted();
  }

  /** Volta o arquivo para a fila, com um sinal novo. */
  function requeue(task: Task) {
    task.controller = new AbortController();
    change(task, { status: "queued" });
    pump();
  }

  function fail(task: Task, failure: UploadFailure, message: string) {
    change(task, { status: "failed", message, failure });
    if (failure === "rejected") task.file = null;
  }

  /**
   * Esquece a sessão e cancela o upload na API. Uma falha, que a Server Action já registra, não
   * muda o destino do envio: o upload que não foi cancelado continua `pending`, e a limpeza o
   * remove depois.
   */
  async function dropSession(task: Task) {
    const session = task.session;
    task.session = null;
    task.confirmed = 0;
    task.stored = false;
    if (!session) return;
    await api.cancel(session.itemId).catch(() => undefined);
  }

  /**
   * Tira do painel os arquivos que terminaram ou falharam. O que falhou com a sessão ainda aberta
   * (por conexão) tem o upload cancelado na API, que devolve o espaço.
   */
  function removeFinished(removed: Task[]) {
    if (removed.length === 0) return;
    tasks = tasks.filter((task) => !removed.includes(task));
    publish();
    removed.forEach((task) => void dropSession(task));
  }

  async function execute(task: Task, file: File) {
    const run: Run = { task, file, signal: task.controller.signal };
    change(task, { status: "uploading", message: undefined, failure: undefined });
    try {
      await upload(run);
      task.file = null;
      task.session = null;
      if (!tasks.includes(task)) {
        // Cancelado, mas a conclusão ganhou na API: o arquivo existe, e a lista o mostra. Parado
        // pela saída do `(drive)`: não há mais tela para atualizar.
        if (task.cancelled) options.onDone?.(task.entry);
        return;
      }
      change(task, { status: "done", progress: 100 });
      options.onDone?.(task.entry);
    } catch (error) {
      // Pausa ou cancelamento: quem os pediu já deixou o estado do arquivo certo.
      if (run.signal.aborted) return;
      if (error instanceof Failed) fail(task, error.failure, error.message);
      else fail(task, "connection", CONNECTION_FAILED);
    } finally {
      // Cancelado com o envio em curso: o upload é desfeito na API depois de o envio parar.
      if (task.cancelled) await dropSession(task);
      task.running = false;
      running -= 1;
      pump();
    }
  }

  /** O arquivo inteiro. Uma sessão expirada recomeça do zero, numa sessão nova, até 3 vezes. */
  async function upload(run: Run) {
    const { task } = run;
    for (;;) {
      try {
        return await transfer(run);
      } catch (error) {
        if (!(error instanceof SessionExpired) || task.restarts >= MAX_RESTARTS) throw error;
        task.restarts += 1;
        await dropSession(task);
        change(task, { progress: 0 });
        interruptIfStopped(run);
      }
    }
  }

  /**
   * Do início à conclusão, numa sessão: uma nova, ou a que já existe (retomada e nova tentativa),
   * que começa pela consulta de progresso.
   */
  async function transfer(run: Run) {
    const { task, file } = run;
    const resuming = task.session !== null;
    if (!task.session) {
      const started = await api.start({
        name: file.name,
        sizeBytes: file.size,
        mimeType: file.type,
        parentId: task.parentId,
      });
      if (!started.ok) throw new Failed("rejected", started.message);
      task.session = { itemId: started.itemId, uploadUrl: started.uploadUrl };
      interruptIfStopped(run);
    }
    await drive(run, resuming, async () => {
      if (!task.stored) {
        await sendChunk(run);
        return false;
      }
      // O storage tem o objeto inteiro: a API confere e ativa.
      await complete(run);
      return true;
    });
  }

  /**
   * Repete `step` até ela dizer que terminou. Uma falha de rede, de status ou um
   * `upload_incomplete` espera 1, 2, 4, 8 e 16 s, consulta o progresso e tenta de novo; depois da
   * quinta espera, o arquivo falha. Um passo que dá certo zera a contagem. Com `recovering`, a
   * consulta vem antes do primeiro passo.
   */
  async function drive(run: Run, recovering: boolean, step: () => Promise<boolean>) {
    let failures = 0;
    for (;;) {
      try {
        if (recovering) {
          await queryProgress(run);
          recovering = false;
        } else if (await step()) {
          return;
        } else {
          failures = 0;
        }
      } catch (error) {
        interruptIfStopped(run);
        if (
          error instanceof SessionExpired ||
          error instanceof Failed ||
          failures >= RETRY_WAIT_MS.length
        ) {
          throw error;
        }
        await sleep(RETRY_WAIT_MS[failures], run.signal);
        failures += 1;
        interruptIfStopped(run);
        recovering = true;
      }
    }
  }

  /**
   * O chunk seguinte ao que o storage confirmou. O arquivo vazio é um chunk só, sem
   * `Content-Range`. Uma 308 que não confirma bytes novos é uma falha do passo, que conta
   * para as 5 tentativas, e não um passo que deu certo. Com todos os bytes confirmados e o
   * objeto ainda não guardado, o pedido final é o `PUT` vazio de `bytes *` e `/<total>`, que
   * fecha a sessão.
   */
  async function sendChunk(run: Run) {
    const { task, file } = run;
    const start = task.confirmed;
    if (file.size === 0) {
      await send(run, { contentRange: null, body: null });
    } else if (start >= file.size) {
      await queryProgress(run);
    } else {
      const end = Math.min(start + chunkSize, file.size);
      await send(run, {
        contentRange: `bytes ${start}-${end - 1}/${file.size}`,
        body: file.slice(start, end),
      });
    }
    if (!task.stored && task.confirmed <= start) {
      throw new Error("O storage não confirmou bytes novos");
    }
  }

  // A consulta de progresso: `PUT` vazio com o `Content-Range` `bytes *` seguido de `/<total>`.
  function queryProgress(run: Run) {
    return send(run, { contentRange: `bytes */${run.file.size}`, body: null });
  }

  /** Um `PUT` à sessão. Registra o que o storage confirmou. */
  async function send(
    run: Run,
    request: Pick<PutRequest, "contentRange" | "body">,
  ): Promise<void> {
    const { task, file } = run;
    const response = await transport({
      url: sessionOf(task).uploadUrl,
      signal: run.signal,
      ...request,
    });
    interruptIfStopped(run);
    assertStored(response);
    // A 308 traz o que o storage recebeu; 200 e 201 são o arquivo inteiro.
    task.stored = response.status !== 308;
    task.confirmed = task.stored ? file.size : confirmedBytes(response.range);
    change(task, { progress: progressOf(task, file) });
  }

  async function complete(run: Run) {
    const { task } = run;
    task.completing = true;
    const result = await api.complete(sessionOf(task).itemId).finally(() => {
      task.completing = false;
    });
    if (result.ok) return;
    // O storage ainda não tem tudo: é mais uma falha do passo, que consulta o progresso e segue.
    if (result.incomplete) throw new Error(result.message);
    // A API já apagou o upload (tamanho diferente) ou ele não existe mais: uma nova tentativa
    // começa noutra sessão.
    task.session = null;
    task.confirmed = 0;
    task.stored = false;
    throw new Failed("mismatch", result.message);
  }

  return {
    /** Põe os arquivos na fila, com `parentId` como destino. Devolve a chave de cada um. */
    add(files: File[], parentId: string): string[] {
      const keys = files.map((file) => {
        const key = String(nextKey++);
        tasks.push({
          file,
          parentId,
          session: null,
          confirmed: 0,
          stored: false,
          controller: new AbortController(),
          running: false,
          restarts: 0,
          completing: false,
          cancelled: false,
          entry: {
            key,
            name: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            status: "queued",
            progress: 0,
          },
        });
        return key;
      });
      publish();
      pump();
      return keys;
    },

    /** Aborta o `PUT` em curso e segura o arquivo. O upload continua `pending` na API. */
    pause(key: string) {
      const task = find(key);
      if (!task || (task.entry.status !== "uploading" && task.entry.status !== "queued")) return;
      task.controller.abort();
      change(task, { status: "paused" });
    },

    /** Continua do byte que o storage confirmou. */
    resume(key: string) {
      const task = find(key);
      if (task?.entry.status === "paused") requeue(task);
    },

    /** Recomeça um arquivo cuja falha pode dar certo: na mesma sessão, se ela existe, ou numa nova. */
    retry(key: string) {
      const task = find(key);
      if (!task || !canRetry(task.entry)) return;
      task.restarts = 0;
      requeue(task);
    },

    /** Aborta o envio, cancela o upload na API e tira o arquivo do painel. */
    cancel(key: string) {
      const task = find(key);
      if (!task || isFinished(task.entry)) return;
      task.cancelled = true;
      task.controller.abort();
      tasks = tasks.filter((other) => other !== task);
      publish();
      // Com o envio em curso, quem desfaz o upload é a própria execução, quando ela para. A
      // conclusão não para no meio: o cancelamento vai já à API, que decide quem ganha.
      if (!task.running || task.completing) void dropSession(task);
    },

    /** Tira do painel um arquivo que terminou ou falhou. */
    dismiss(key: string) {
      const task = find(key);
      if (task && isFinished(task.entry)) removeFinished([task]);
    },

    /**
     * Para todos os envios e esvazia o painel, quando a pessoa sai do `(drive)` (docs/lld.md,
     * seção 7.4). Os uploads continuam `pending` na API, como ao fechar a aba. O motor segue
     * aceitando arquivos novos depois.
     */
    stop() {
      tasks.forEach((task) => task.controller.abort());
      tasks = [];
      publish();
    },

    /** Esvazia o painel dos arquivos que terminaram ou falharam. */
    clearFinished() {
      removeFinished(tasks.filter((task) => isFinished(task.entry)));
    },

    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** De 0 a 100, pelo que o storage confirmou. O arquivo vazio fica em 0 até o storage guardá-lo. */
function progressOf(task: Task, file: File): number {
  if (task.stored) return 100;
  if (file.size === 0) return 0;
  return Math.floor((task.confirmed / file.size) * 100);
}

function sessionOf(task: Task) {
  if (!task.session) throw new Error("O envio não tem sessão de upload");
  return task.session;
}

/** 404 e 410 são a sessão que acabou; 5xx e 4xx inesperados, falha que se repete. 2xx e 308 passam. */
function assertStored(response: PutResponse) {
  if (response.status === 404 || response.status === 410) throw new SessionExpired();
  if (response.status !== 308 && (response.status < 200 || response.status >= 300)) {
    throw new Error(`O storage respondeu ${response.status}`);
  }
}

/** Quantos bytes o storage tem, pelo `Range` (`bytes=0-<último>`) da 308. Sem o cabeçalho, nenhum. */
function confirmedBytes(range: string | null): number {
  const match = range ? /^bytes=0-(\d+)$/.exec(range) : null;
  return match ? Number(match[1]) + 1 : 0;
}
