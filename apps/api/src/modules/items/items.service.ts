import { Inject, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { v7 as uuidv7 } from 'uuid';
import { Prisma } from '../../generated/prisma/client.js';
import {
  FILE_STORAGE,
  type FileStorage,
} from '../../infra/storage/file-storage.js';
import {
  DownloadUrl,
  ExpiredPendingUpload,
  FileUpload,
  ItemPage,
  NewPendingFile,
} from './entities/item.entity.js';
import { ItemNotFoundError } from './errors/item-not-found.error.js';
import { decodeItemCursor, encodeItemCursor } from './item-cursor.js';
import { ItemsRepository } from './items.repository.js';

/** O atalho da Pasta raiz do Usuário, aceito no lugar do id de uma pasta. */
const ROOT_ALIAS = 'root';

/** Validade da URL de download: 5 minutos (seção 3.4 do docs/lld.md). */
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

/**
 * Service público do módulo de itens, dono dos Itens e da Pasta raiz.
 */
@Injectable()
export class ItemsService {
  constructor(
    private readonly items: ItemsRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  /**
   * Uma página dos filhos ativos da pasta, pastas primeiro e depois por nome.
   * Até a funcionalidade de pastas, só a Pasta raiz é aceita, pelo atalho
   * `root`, e ela nasce aqui no primeiro uso. Um `cursor` ilegível é entrada
   * inválida.
   */
  async listChildren(
    ownerId: string,
    folderId: string,
    page: { limit: number; cursor?: string },
  ): Promise<ItemPage> {
    if (folderId !== ROOT_ALIAS) {
      throw new ItemNotFoundError();
    }
    const after =
      page.cursor === undefined ? undefined : decodeItemCursor(page.cursor);
    const rootId = await this.items.ensureRoot(ownerId, uuidv7);
    // Um Item a mais que a página diz se há outra depois dela.
    const rows = await this.items.listActiveChildren(
      rootId,
      after,
      page.limit + 1,
    );
    const items = rows.slice(0, page.limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > page.limit && last ? encodeItemCursor(last) : null,
    };
  }

  /**
   * O id da pasta de destino de um envio: a Pasta raiz, pelo atalho `root`, ou
   * uma pasta ativa do Usuário. Qualquer outro valor, inclusive um texto que
   * não é UUID, é `not_found`.
   */
  async resolveDestinationFolder(
    ownerId: string,
    folderId: string,
  ): Promise<string> {
    if (folderId === ROOT_ALIAS) {
      return this.items.ensureRoot(ownerId, uuidv7);
    }
    if (
      !isUUID(folderId) ||
      !(await this.items.hasActiveFolder(ownerId, folderId))
    ) {
      throw new ItemNotFoundError();
    }
    return folderId;
  }

  /** Cria o Item `pending` de um arquivo, dentro da transação de quem chama. */
  createPendingFile(
    file: NewPendingFile,
    db: Prisma.TransactionClient,
  ): Promise<{ createdAt: Date }> {
    return this.items.createPendingFile(file, db);
  }

  /**
   * A URL assinada de leitura de um arquivo ativo do Usuário, com o nome do
   * arquivo no `Content-Disposition`. Pasta, item `pending`, de outro Usuário,
   * inexistente ou com id que não é UUID é `not_found`.
   */
  async downloadUrl(ownerId: string, id: string): Promise<DownloadUrl> {
    const file = await this.findFile(ownerId, id);
    if (file?.status !== 'active') {
      throw new ItemNotFoundError();
    }
    const signed = await this.storage.signReadUrl({
      objectName: file.objectKey,
      fileName: file.name,
      expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
    });
    return { url: signed.url, expiresAt: signed.expiresAt };
  }

  /** O arquivo `pending` ou `active` do Usuário, ou `null` (outro dono, inexistente ou id que não é UUID). */
  findFile(ownerId: string, id: string): Promise<FileUpload | null> {
    return isUUID(id)
      ? this.items.findFile(ownerId, id)
      : Promise.resolve(null);
  }

  /** Ativa o Item `pending`. Devolve `false` se outra conclusão chegou antes. */
  activatePending(id: string): Promise<boolean> {
    return this.items.activatePending(id);
  }

  /**
   * Apaga o Item `pending`, dentro da transação de quem chama. Só quem apagou
   * (`true`) devolve o espaço reservado.
   */
  removePending(id: string, db: Prisma.TransactionClient): Promise<boolean> {
    return this.items.deletePending(id, db);
  }

  /** Até `limit` uploads `pending` criados até `before`, a partir do que vem depois de `afterId`. */
  listExpiredPending(
    before: Date,
    afterId: string | undefined,
    limit: number,
  ): Promise<ExpiredPendingUpload[]> {
    return this.items.listExpiredPending(before, afterId, limit);
  }

  /** Guarda o endereço da sessão de upload no Item `pending`. */
  setUploadSession(id: string, uploadSessionUri: string): Promise<void> {
    return this.items.setUploadSession(id, uploadSessionUri);
  }
}
