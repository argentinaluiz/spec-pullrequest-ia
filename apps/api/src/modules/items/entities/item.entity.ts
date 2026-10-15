export type ItemType = 'file' | 'folder';

/** Nome da Pasta raiz, que nasce sob demanda e nunca aparece numa listagem. */
export const ROOT_FOLDER_NAME = 'Meus arquivos';

/** Um Item ativo, como a listagem de uma pasta o devolve. */
export interface Item {
  id: string;
  type: ItemType;
  name: string;
  /** 0 para pastas. Cabe num `number`: o maior arquivo aceito tem 5 GB. */
  sizeBytes: number;
  /** Nulo para pastas. */
  mimeType: string | null;
  updatedAt: Date;
}

/** Uma página da listagem de uma pasta. `nextCursor` é nulo na última. */
export interface ItemPage {
  items: Item[];
  nextCursor: string | null;
}

/**
 * Onde um Item fica na ordem da listagem: o tipo, o nome e o id, que desempata
 * nomes iguais. O cursor guarda a do último Item da página.
 */
export type ItemPosition = Pick<Item, 'type' | 'name' | 'id'>;

/** Um arquivo de um Usuário que ainda está sendo enviado (`pending`) ou já foi concluído (`active`). */
export interface FileUpload extends Item {
  status: 'pending' | 'active';
  /** Chave do objeto no bucket. */
  objectKey: string;
  createdAt: Date;
}

/** O que o início de um envio grava no Item `pending`. */
export interface NewPendingFile {
  id: string;
  ownerId: string;
  parentId: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  objectKey: string;
}

/** A URL assinada de leitura de um arquivo e o instante em que ela vence. */
export interface DownloadUrl {
  url: string;
  expiresAt: Date;
}

/** Um upload `pending` ou `deleting`, com o que a limpeza e o cancelamento precisam para desfazê-lo. */
export interface PendingUpload {
  id: string;
  ownerId: string;
  /** `deleting`: um expurgo já o tomou e devolveu a Cota, e falta limpar o storage e apagar a linha. */
  status: 'pending' | 'deleting';
  sizeBytes: number;
  objectKey: string | null;
  /** Endereço da sessão de upload no storage, ausente se ela nunca chegou a ser gravada. */
  uploadSessionUri: string | null;
}

/** O upload `pending` que já tem sessão no storage, com o que a retomada devolve. */
export interface ResumableUpload {
  id: string;
  /** Endereço da sessão de upload no storage. */
  uploadSessionUri: string;
  /** Quando o upload começou: o prazo da sessão conta daqui. */
  createdAt: Date;
}
