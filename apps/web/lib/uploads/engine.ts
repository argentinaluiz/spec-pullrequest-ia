import { fingerprintOf, sameFile, type Fingerprint } from "@/lib/uploads/fingerprint";
import type { IncompleteRecord, IncompleteStore } from "@/lib/uploads/incomplete-store";
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

/** Quanto a consulta de progresso de um incompleto restaurado espera antes de o item ficar em 0%. */
export const RESTORE_QUERY_TIMEOUT_MS = 10_000;
const RESUME_UNAVAILABLE = "Não foi possível retomar agora. Tente de novo.";

const CONNECTION_FAILED = "A conexão falhou durante o envio";

/** O painel sem nenhum envio. */
export const INITIAL_SNAPSHOT: UploadSnapshot = { entries: [] };

/** O envio terminou, concluído ou com falha: só sai do painel quando a pessoa o tira. */
export function isFinished(entry: UploadEntry): boolean {
  return entry.status === "done" || entry.status === "failed";
}

/** O envio está mandando bytes ou espera vaga na fila: fechar a aba o interromperia. */
export function isTransferring(entry: UploadEntry): boolean {
  return entry.status === "uploading" || entry.status === "queued";
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
/** A sessão recusou o pedido com outro 4xx: o mesmo pedido teria a mesma resposta, e ela não serve mais. */
class SessionRefused extends Error {}
/** Uma falha do passo que a API explicou: conta para as tentativas, e a mensagem dela vai à tela. */
class StepFailed extends Error {}
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
  /** A impressão do arquivo, que o armazenamento guarda para reconhecê-lo depois de fechar a aba. */
  fingerprint: Fingerprint;
  /**
   * A sessão em curso, depois de a API aceitar o início. O `uploadUrl` é `null` no incompleto de
   * antes de fechar a aba cuja consulta da retomada falhou: a escolha do arquivo a repete.
   */
  session: { itemId: string; uploadUrl: string | null } | null;
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
  /** A consulta da sessão, pedida ao escolher o arquivo, ainda não respondeu. */
  resolving: boolean;
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
  let store: IncompleteStore | null = null;
  /** Muda a cada `stop()`: o que a retomada de antes devolver depois dele não vale mais. */
  let epoch = 0;
  /** O Usuário do armazenamento ligado: ligar o mesmo de novo não faz nada. */
  let boundUserId: string | null = null;

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
    if (failure === "rejected") {
      task.file = null;
      // Sem "Tentar de novo", o envio não volta como incompleto na próxima visita.
      if (task.session) forget(task.session.itemId);
    }
  }

  /** Guarda o que o navegador precisa para o envio voltar depois de fechar a aba. */
  function remember(task: Task) {
    if (task.session) store?.save({ itemId: task.session.itemId, fingerprint: task.fingerprint });
  }

  /** Tira o envio do armazenamento: ele não volta mais depois de fechar a aba. */
  function forget(itemId: string) {
    store?.remove(itemId);
  }

  /** Esquece a sessão: a próxima tentativa começa do zero, noutra. */
  function resetSession(task: Task) {
    if (task.session) forget(task.session.itemId);
    task.session = null;
    task.confirmed = 0;
    task.stored = false;
  }

  /**
   * Esquece a sessão e cancela o upload na API. Uma falha, que a Server Action já registra, não
   * muda o destino do envio: o upload que não foi cancelado continua `pending`, e a limpeza o
   * remove depois.
   */
  async function dropSession(task: Task) {
    const itemId = task.session?.itemId;
    resetSession(task);
    if (!itemId) return;
    await api.cancel(itemId).catch(() => undefined);
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
      if (task.session) forget(task.session.itemId);
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
      else if (error instanceof StepFailed) fail(task, "connection", error.message);
      else fail(task, "connection", CONNECTION_FAILED);
    } finally {
      // Cancelado com o envio em curso: o upload é desfeito na API depois de o envio parar.
      if (task.cancelled) await dropSession(task);
      task.running = false;
      running -= 1;
      pump();
    }
  }

  /**
   * O arquivo inteiro. Uma sessão expirada recomeça do zero, numa sessão nova, até 3 vezes. Uma
   * sessão que recusou o pedido é descartada, com o upload cancelado na API, e o arquivo falha: a
   * nova tentativa começa noutra sessão.
   */
  async function upload(run: Run) {
    const { task } = run;
    for (;;) {
      try {
        return await transfer(run);
      } catch (error) {
        if (error instanceof SessionRefused) {
          await dropSession(task);
          throw new Failed("discarded", CONNECTION_FAILED);
        }
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
      remember(task);
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
   * Repete `step` até ela dizer que terminou. Uma falha de rede, de status ou da conclusão que
   * mantém a sessão espera 1, 2, 4, 8 e 16 s, consulta o progresso e tenta de novo; depois da
   * quinta espera, o arquivo falha. Um passo que dá certo zera a contagem. Com `recovering`, a
   * consulta vem antes do primeiro passo, menos quando o storage já tem o arquivo inteiro: aí só
   * a conclusão se repete.
   */
  async function drive(run: Run, recovering: boolean, step: () => Promise<boolean>) {
    let failures = 0;
    for (;;) {
      try {
        if (recovering && !run.task.stored) {
          await queryProgress(run.task, run.signal, run.file.size);
        } else if (await step()) {
          return;
        } else {
          failures = 0;
        }
        recovering = false;
      } catch (error) {
        interruptIfStopped(run);
        if (
          error instanceof SessionExpired ||
          error instanceof SessionRefused ||
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
      await send(task, run.signal, file.size, { contentRange: null, body: null });
    } else if (start >= file.size) {
      await queryProgress(task, run.signal, file.size);
    } else {
      const end = Math.min(start + chunkSize, file.size);
      await send(task, run.signal, file.size, {
        contentRange: `bytes ${start}-${end - 1}/${file.size}`,
        body: file.slice(start, end),
      });
    }
    if (!task.stored && task.confirmed <= start) {
      throw new Error("O storage não confirmou bytes novos");
    }
  }

  // A consulta de progresso: `PUT` vazio com o `Content-Range` `bytes *` seguido de `/<total>`.
  function queryProgress(task: Task, signal: AbortSignal, total: number) {
    return send(task, signal, total, { contentRange: `bytes */${total}`, body: null });
  }

  /** Um `PUT` à sessão de um arquivo de `total` bytes. Registra o que o storage confirmou. */
  async function send(
    task: Task,
    signal: AbortSignal,
    total: number,
    request: Pick<PutRequest, "contentRange" | "body">,
  ): Promise<void> {
    const response = await transport({ url: sessionOf(task).uploadUrl, signal, ...request });
    if (signal.aborted) throw new Interrupted();
    assertStored(response);
    // A 308 traz o que o storage recebeu; 200 e 201 são o arquivo inteiro.
    task.stored = response.status !== 308;
    task.confirmed = task.stored ? total : confirmedBytes(response.range);
    change(task, { progress: progressOf(task, total) });
  }

  /**
   * Pede a conclusão à API (docs/lld.md, seção 7.4). O upload que a API descartou ou que não
   * existe mais (`upload_size_mismatch`, `not_found`) descarta a sessão. O `upload_incomplete` e
   * as falhas que se repetem (`internal_error`, `rate_limited`) mantêm a sessão e são uma falha do
   * passo: o primeiro consulta o progresso antes de tentar de novo, e as outras repetem só a
   * conclusão. Qualquer outro código encerra o envio, sem "Tentar de novo", e a sessão fica para o
   * cancelamento quando o arquivo sai do painel. Uma chamada rejeitada, como a da Server Action que
   * leva à Sessão encerrada, não se repete.
   */
  async function complete(run: Run) {
    const { task } = run;
    task.completing = true;
    const result = await api
      .complete(sessionOf(task).itemId)
      .catch(() => {
        throw new Failed("connection", CONNECTION_FAILED);
      })
      .finally(() => {
        task.completing = false;
      });
    if (result.ok) return;
    if (result.reason === "discarded") {
      // A nova tentativa começa noutra sessão.
      resetSession(task);
      throw new Failed("discarded", result.message);
    }
    if (result.reason === "terminal") throw new Failed("rejected", result.message);
    // O storage ainda não tem tudo: a consulta de progresso diz o que falta.
    if (result.reason === "incomplete") task.stored = false;
    throw new StepFailed(result.message);
  }

  /** Uma linha do painel, com o estado de uma execução que ainda não começou. */
  function newTask(init: {
    file: File | null;
    parentId: string;
    fingerprint: Fingerprint;
    session: Task["session"];
    entry: Pick<UploadEntry, "name" | "mimeType" | "sizeBytes" | "status">;
  }): Task {
    const { entry, ...rest } = init;
    return {
      ...rest,
      confirmed: 0,
      stored: false,
      controller: new AbortController(),
      running: false,
      restarts: 0,
      completing: false,
      cancelled: false,
      resolving: false,
      entry: { ...entry, key: String(nextKey++), progress: 0 },
    };
  }

  /**
   * Um incompleto guardado: entra esperando o arquivo, com a porcentagem que o storage já tem.
   * Devolve `false` se a API não o acha mais, e ele fica de fora do painel. Uma consulta que
   * falha deixa a sessão sem o endereço e a porcentagem em 0.
   */
  async function restore(record: IncompleteRecord, startedIn: number): Promise<boolean> {
    const resumed = await api.resume(record.itemId).catch(() => null);
    if (startedIn !== epoch) return true;
    if (resumed && !resumed.ok && resumed.gone) return false;
    const { fingerprint } = record;
    const task = newTask({
      file: null,
      parentId: "root",
      fingerprint,
      session: { itemId: record.itemId, uploadUrl: resumed?.ok ? resumed.uploadUrl : null },
      entry: {
        name: fingerprint.name,
        mimeType: "application/octet-stream",
        sizeBytes: fingerprint.sizeBytes,
        status: "waiting",
      },
    });
    tasks.push(task);
    publish();
    if (task.session?.uploadUrl) {
      await queryWithin(task, fingerprint.sizeBytes);
    }
    return true;
  }

  /** A consulta de progresso do incompleto, que desiste depois de `RESTORE_QUERY_TIMEOUT_MS`. */
  async function queryWithin(task: Task, total: number) {
    const query = new AbortController();
    const timeout = sleep(RESTORE_QUERY_TIMEOUT_MS, query.signal);
    await Promise.race([
      queryProgress(task, query.signal, total).catch(() => undefined),
      timeout.catch(() => undefined),
    ]);
    query.abort();
  }

  return {
    /** Põe os arquivos na fila, com `parentId` como destino. Devolve a chave de cada um. */
    add(files: File[], parentId: string): string[] {
      const keys = files.map((file) => {
        const task = newTask({
          file,
          parentId,
          fingerprint: fingerprintOf(file),
          session: null,
          entry: { name: file.name, mimeType: file.type, sizeBytes: file.size, status: "queued" },
        });
        tasks.push(task);
        return task.entry.key;
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
      epoch += 1;
      boundUserId = null;
      store = null;
      tasks.forEach((task) => task.controller.abort());
      tasks = [];
      publish();
    },

    /** Esvazia o painel dos arquivos que terminaram ou falharam. */
    clearFinished() {
      removeFinished(tasks.filter((task) => isFinished(task.entry)));
    },

    /**
     * Liga o armazenamento do Usuário (docs/lld.md, seção 7.4): grava os envios que já têm sessão
     * e traz de volta os incompletos guardados, no estado de espera pelo arquivo. Para cada um, pede
     * a sessão à API e consulta o progresso no storage; o que a API não acha mais sai sem aviso.
     * Resolve quando todos foram consultados.
     */
    async bindStore(next: IncompleteStore) {
      if (boundUserId === next.userId) return;
      boundUserId = next.userId;
      store = next;
      const startedIn = epoch;
      tasks.forEach(remember);
      const known = new Set(tasks.map((task) => task.session?.itemId));
      const records = next.load().filter((record) => !known.has(record.itemId));
      const results = await Promise.all(records.map((record) => restore(record, startedIn)));
      if (startedIn !== epoch) return;
      // O que a API não acha mais sai do armazenamento de uma vez.
      const gone = new Set(records.filter((_, index) => !results[index]).map((r) => r.itemId));
      if (gone.size > 0) next.saveAll(next.load().filter((record) => !gone.has(record.itemId)));
    },

    /**
     * O arquivo que a pessoa escolheu para um incompleto. Se for o mesmo, o envio continua na mesma
     * sessão; se não for, só avisa e continua esperando.
     */
    async selectFile(key: string, file: File) {
      const task = find(key);
      if (!task || task.entry.status !== "waiting" || task.resolving) return;
      if (!sameFile(task.fingerprint, fingerprintOf(file))) {
        change(task, { mismatch: true });
        return;
      }
      const startedIn = epoch;
      const { session } = task;
      if (session && !session.uploadUrl) {
        // A consulta da retomada falhou ao voltar: pede a sessão agora. Enquanto espera, o envio
        // não está mais esperando o arquivo, e uma segunda escolha não o enfileira de novo.
        task.resolving = true;
        const resumed = await api.resume(session.itemId).catch(() => null);
        task.resolving = false;
        if (startedIn !== epoch || !tasks.includes(task) || task.entry.status !== "waiting") return;
        if (resumed?.ok) {
          session.uploadUrl = resumed.uploadUrl;
        } else if (resumed?.gone) {
          // O upload não existe mais: sai do painel e do armazenamento, como na volta à tela.
          forget(session.itemId);
          tasks = tasks.filter((other) => other !== task);
          publish();
          return;
        } else {
          change(task, { message: RESUME_UNAVAILABLE });
          return;
        }
      }
      task.file = file;
      task.restarts = 0;
      change(task, { mimeType: file.type, mismatch: undefined, message: undefined });
      requeue(task);
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
function progressOf(task: Task, total: number): number {
  if (task.stored) return 100;
  if (total === 0) return 0;
  return Math.floor((task.confirmed / total) * 100);
}

function sessionOf(task: Task): { itemId: string; uploadUrl: string } {
  if (!task.session?.uploadUrl) throw new Error("O envio não tem sessão de upload");
  return { itemId: task.session.itemId, uploadUrl: task.session.uploadUrl };
}

/**
 * 404 e 410 são a sessão que acabou; 5xx, falha que se repete; outro 4xx, a sessão que recusou o
 * pedido, que repetir não resolve (docs/lld.md, seção 7.4). 2xx e 308 passam.
 */
function assertStored(response: PutResponse) {
  const { status } = response;
  if (status === 404 || status === 410) throw new SessionExpired();
  if (status >= 400 && status < 500) throw new SessionRefused();
  if (status !== 308 && (status < 200 || status >= 300)) {
    throw new Error(`O storage respondeu ${status}`);
  }
}

/** Quantos bytes o storage tem, pelo `Range` (`bytes=0-<último>`) da 308. Sem o cabeçalho, nenhum. */
function confirmedBytes(range: string | null): number {
  const match = range ? /^bytes=0-(\d+)$/.exec(range) : null;
  return match ? Number(match[1]) + 1 : 0;
}
