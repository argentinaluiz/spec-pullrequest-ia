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

/** O que a Server Action de concluir um envio devolve. `incomplete`: o storage ainda não tem o objeto inteiro. */
export type CompleteUploadResult =
  | { ok: true }
  | { ok: false; message: string; incomplete: boolean };

/** O que a Server Action de cancelar um envio devolve. A falha não muda o destino do envio. */
export type CancelUploadResult = { ok: true } | { ok: false; message: string };

/** As ações da API que o motor usa. No navegador, são Server Actions. */
export interface UploadApi {
  start: (input: StartUploadInput) => Promise<StartUploadResult>;
  complete: (itemId: string) => Promise<CompleteUploadResult>;
  /**
   * Cancela o upload pendente e devolve o espaço. Uma falha (resultado ou exceção) não muda o
   * destino do envio: o upload continua `pending`, e a limpeza o remove depois.
   */
  cancel: (itemId: string) => Promise<CancelUploadResult>;
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

/** Em que pé o envio de um arquivo está, como o painel o mostra. */
export type UploadStatus = "queued" | "uploading" | "paused" | "done" | "failed";

/**
 * Por que o envio falhou: a API recusou o início (`rejected`: Cota, limite de tamanho), os bytes
 * não chegaram ao storage (`connection`) ou a conclusão descartou o upload (`mismatch`: tamanho
 * divergente, ou o upload já não existe). Só `rejected` não melhora com uma nova tentativa.
 */
export type UploadFailure = "rejected" | "connection" | "mismatch";

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
}

export interface UploadSnapshot {
  entries: UploadEntry[];
}
