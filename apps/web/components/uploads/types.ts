/** O que a Server Action de iniciar um envio devolve ao navegador. */
export type StartUploadResult =
  | { ok: true; itemId: string; uploadUrl: string }
  | { ok: false; message: string };

/** O que a Server Action de concluir um envio devolve ao navegador. */
export type CompleteUploadResult = { ok: true } | { ok: false; message: string };

export type StartUpload = (input: {
  name: string;
  sizeBytes: number;
  mimeType: string;
}) => Promise<StartUploadResult>;

export type CompleteUpload = (itemId: string) => Promise<CompleteUploadResult>;

/** Em que pé o envio de um arquivo está, como o painel o mostra. */
export type UploadStatus = "uploading" | "done" | "failed";

/** Um arquivo no painel de envios. */
export interface UploadEntry {
  /** Identifica a linha no painel. Não é o id do Item, que só existe depois de a API aceitar. */
  key: string;
  name: string;
  mimeType: string;
  status: UploadStatus;
  /** De 0 a 100, enquanto `uploading`. */
  progress: number;
  /** A mensagem em português, quando `failed`. */
  message?: string;
}
