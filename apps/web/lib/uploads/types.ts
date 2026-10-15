/* Os tipos do motor de envio (docs/lld.md, seção 7.4). O motor não conhece React nem a rede: recebe o transporte, o relógio e as ações da API. */

/** O que a Server Action de iniciar um envio recebe. */
export interface StartUploadInput {
  name: string;
  sizeBytes: number;
  mimeType: string;
  /** `root` ou o id da pasta de destino. */
  parentId: string;
}

/** O que a Server Action de iniciar um envio devolve ao navegador. */
export type StartUploadResult =
  | { ok: true; itemId: string; uploadUrl: string }
  | { ok: false; message: string };

/**
 * O que a Server Action de concluir um envio devolve. Na falha, `reason` diz o que vale a sessão:
 * `discarded`, a API apagou o upload ou ele não existe mais (`upload_size_mismatch`, `not_found`)
 * e a sessão não serve mais; `incomplete`, o storage ainda não tem o objeto inteiro
 * (`upload_incomplete`); `retryable`, a sessão continua e só a conclusão se repete
 * (`internal_error`, `rate_limited`); `terminal`, qualquer outro código, que encerra o envio sem
 * nova tentativa.
 */
export type CompleteUploadResult =
  | { ok: true }
  | { ok: false; message: string; reason: CompleteFailureReason };

/** Por que a conclusão falhou, do ponto de vista da sessão de upload. */
export type CompleteFailureReason = "discarded" | "incomplete" | "retryable" | "terminal";

/** O que a Server Action de cancelar um envio devolve. A falha não muda o destino do envio. */
export type CancelUploadResult = { ok: true } | { ok: false; message: string };

/**
 * O que a Server Action de retomar um envio devolve. Na falha, `gone` diz que o upload não existe
 * mais na API (`not_found`: concluído, cancelado ou limpo); outra falha deixa o envio esperando.
 */
export type ResumeUploadResult = { ok: true; uploadUrl: string } | { ok: false; gone: boolean };

/** As ações da API que o motor usa. No navegador, são Server Actions. */
export interface UploadApi {
  start: (input: StartUploadInput) => Promise<StartUploadResult>;
  complete: (itemId: string) => Promise<CompleteUploadResult>;
  /**
   * Cancela o upload pendente e devolve o espaço. Uma falha (resultado ou exceção) não muda o
   * destino do envio: o upload continua `pending`, e a limpeza o remove depois.
   */
  cancel: (itemId: string) => Promise<CancelUploadResult>;
  /** A sessão que a criação do upload fez, sem criar outra, para o envio incompleto de antes. */
  resume: (itemId: string) => Promise<ResumeUploadResult>;
}

/** Um `PUT` à sessão de upload do storage. */
export interface PutRequest {
  url: string;
  // `bytes <início>-<fim>/<total>`; na consulta de progresso, `bytes *` e `/<total>`; nenhum no arquivo vazio.
  contentRange: string | null;
  body: Blob | null;
  signal: AbortSignal;
}

/** A resposta do storage: o status e o cabeçalho `Range` da 308, se vier. Uma falha de rede é uma exceção. */
export interface PutResponse {
  status: number;
  range: string | null;
}

export type UploadTransport = (request: PutRequest) => Promise<PutResponse>;

/** Espera `ms` milissegundos, ou menos se o sinal disparar. */
export type UploadSleep = (ms: number, signal: AbortSignal) => Promise<void>;

/** Em que pé o envio de um arquivo está, como o painel o mostra. `waiting` é o incompleto de antes de fechar a aba, que espera a pessoa escolher o arquivo de novo. */
export type UploadStatus = "queued" | "uploading" | "paused" | "waiting" | "done" | "failed";

/**
 * Por que o envio falhou: a API recusou o início (Cota, limite de tamanho) ou a conclusão com um
 * código que outra tentativa não muda (`rejected`), os bytes não chegaram ao storage ou a
 * conclusão não respondeu bem (`connection`, na mesma sessão), ou a sessão não serve mais
 * (`discarded`: a conclusão apagou o upload ou ele não existe mais, ou o storage recusou o pedido
 * com um 4xx). Só `rejected` não melhora com uma nova tentativa.
 */
export type UploadFailure = "rejected" | "connection" | "discarded";

/** Um arquivo no painel de envios. */
export interface UploadEntry {
  /** Identifica a linha no painel. Não é o id do Item, que só existe depois de a API aceitar. */
  key: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  status: UploadStatus;
  /** De 0 a 100: o que o storage confirmou. */
  progress: number;
  /** A mensagem em português, quando `failed`. */
  message?: string;
  /** O motivo, quando `failed`. */
  failure?: UploadFailure;
  /** Quando `waiting`: o arquivo escolhido não é o original. */
  mismatch?: boolean;
}

export interface UploadSnapshot {
  entries: UploadEntry[];
}
