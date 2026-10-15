/** O storage de arquivos está fora do ar ou recusou a chamada (rede, permissão, bucket inexistente). */
export class StorageUnavailableError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('O armazenamento de arquivos está indisponível.', options);
    this.name = 'StorageUnavailableError';
  }
}

export interface CreateUploadSessionInput {
  objectName: string;
  mimeType: string;
  /** Origem do frontend. O Cloud Storage amarra a sessão ao CORS dessa origem. */
  origin: string;
}

export interface SignReadUrlInput {
  objectName: string;
  /** Nome que o navegador sugere ao baixar o arquivo. */
  fileName: string;
  /** Validade da URL, em segundos, contada do instante da assinatura. */
  expiresInSeconds: number;
}

/** Uma URL assinada de leitura e o instante em que ela vence. */
export interface SignedReadUrl {
  url: string;
  expiresAt: Date;
}

/**
 * Storage de arquivos, como as regras de negócio o enxergam. O fornecedor fica na
 * implementação, ligada no `StorageModule` pelo token `FILE_STORAGE`.
 */
export interface FileStorage {
  /** Cria a sessão de upload retomável e devolve o endereço dela, que o navegador alcança. */
  createUploadSession(input: CreateUploadSessionInput): Promise<string>;
  /** Devolve uma URL assinada de leitura, que baixa o objeto com o nome do arquivo, e o vencimento dela. */
  signReadUrl(input: SignReadUrlInput): Promise<SignedReadUrl>;
  /** Tamanho em bytes, ou `null` se o objeto não existe (o envio ainda não terminou). */
  getObjectSize(objectName: string): Promise<number | null>;
  /** Apaga o objeto. Um objeto que não existe não é erro. */
  deleteObject(objectName: string): Promise<void>;
  /** Cancela a sessão pelo endereço dela. Uma sessão que já terminou ou expirou não é erro. */
  cancelUploadSession(sessionUrl: string): Promise<void>;
}

export const FILE_STORAGE = Symbol('FILE_STORAGE');
