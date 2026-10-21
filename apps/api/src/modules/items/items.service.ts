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
  Item,
  ItemDetail,
  PendingUpload,
  ResumableUpload,
  FileUpload,
  ItemPage,
  NewPendingFile,
} from './entities/item.entity.js';
import { InputValidationError } from '../../common/errors/input-validation.error.js';
import { InvalidMoveError } from './errors/invalid-move.error.js';
import { ItemNotFoundError } from './errors/item-not-found.error.js';
import { MaxDepthExceededError } from './errors/max-depth-exceeded.error.js';
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
   * Uma página dos filhos ativos da pasta, pastas primeiro e depois por nome:
   * a Pasta raiz, pelo atalho `root` (que nasce aqui no primeiro uso), ou uma
   * pasta ativa do Usuário. Com `foldersOnly`, só as pastas. Um `cursor`
   * ilegível é entrada inválida.
   */
  async listChildren(
    ownerId: string,
    folderId: string,
    page: { limit: number; cursor?: string; foldersOnly?: boolean },
  ): Promise<ItemPage> {
    const after =
      page.cursor === undefined ? undefined : decodeItemCursor(page.cursor);
    const parentId = await this.resolveDestinationFolder(ownerId, folderId);
    // Um Item a mais que a página diz se há outra depois dela.
    const rows = await this.items.listActiveChildren(
      parentId,
      after,
      page.limit + 1,
      page.foldersOnly,
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
   * A pasta ativa do Usuário (ou a Pasta raiz, pelo atalho `root`) e o caminho
   * do topo até ela. Qualquer outro id é `not_found`.
   */
  async getFolder(ownerId: string, id: string): Promise<ItemDetail> {
    const path = await this.items.folderPath(
      ownerId,
      await this.folderIdOf(ownerId, id),
    );
    const folder = path.at(-1);
    if (!folder) {
      throw new ItemNotFoundError();
    }
    return {
      item: {
        id: folder.id,
        type: 'folder',
        name: folder.name,
        sizeBytes: 0,
        mimeType: null,
        updatedAt: folder.updatedAt,
      },
      trail: path.map(({ id: entryId, name }) => ({ id: entryId, name })),
    };
  }

  /**
   * Cria uma pasta ativa em `parentId` (`root` ou uma pasta ativa do Usuário).
   * A pasta nasce no nível do destino mais um: passar de 50 é
   * `max_depth_exceeded`.
   */
  async createFolder(
    ownerId: string,
    input: { name: string; parentId: string },
  ): Promise<Item> {
    const result = await this.items.createFolderWithinDepthLimit({
      id: uuidv7(),
      ownerId,
      parentId: await this.folderIdOf(ownerId, input.parentId),
      name: input.name,
    });
    switch (result.status) {
      case 'created':
        return result.folder;
      case 'too_deep':
        throw new MaxDepthExceededError();
      case 'parent_not_found':
        throw new ItemNotFoundError();
    }
  }

  /**
   * Troca o nome de um Item ativo do Usuário, que passa a ter a data de
   * modificação de agora. A Pasta raiz, pelo id ou pelo atalho `root`, não se
   * renomeia: é entrada inválida. Qualquer outro Item que o Usuário não vê
   * (inexistente, de outro dono, `pending`, id que não é UUID) é `not_found`.
   */
  async rename(ownerId: string, id: string, name: string): Promise<Item> {
    const result = await this.items.renameActive(
      ownerId,
      await this.folderIdOf(ownerId, id),
      name,
    );
    switch (result.status) {
      case 'renamed':
        return result.item;
      case 'root':
        throw new InputValidationError([
          { field: 'id', messages: ['A Pasta raiz não pode ser renomeada.'] },
        ]);
      case 'not_found':
        throw new ItemNotFoundError();
    }
  }

  /**
   * Muda o nome, o pai, ou os dois, de um Item ativo do Usuário. Sem nenhum
   * dos campos, é entrada inválida.
   */
  async update(
    ownerId: string,
    id: string,
    changes: { name?: string | null; parentId?: string | null },
  ): Promise<Item> {
    // Um `null` no JSON passa pelo `@IsOptional()` do DTO: vale como campo ausente.
    const name = changes.name ?? undefined;
    const parentId = changes.parentId ?? undefined;
    if (parentId !== undefined) {
      return this.move(ownerId, id, parentId, name);
    }
    if (name === undefined) {
      throw new InputValidationError([
        { field: 'name', messages: ['name ou parentId é obrigatório.'] },
      ]);
    }
    return this.rename(ownerId, id, name);
  }

  /**
   * Move um Item ativo do Usuário para `parentId` (`root` ou uma pasta ativa
   * do Usuário), renomeando-o junto se vier um `name`.
   */
  private async move(
    ownerId: string,
    id: string,
    parentId: string,
    name?: string,
  ): Promise<Item> {
    const [itemId, destinationId] = await Promise.all([
      this.folderIdOf(ownerId, id),
      this.folderIdOf(ownerId, parentId),
    ]);
    const result = await this.items.moveActive(ownerId, {
      id: itemId,
      parentId: destinationId,
      name,
    });
    switch (result.status) {
      case 'moved':
        return result.item;
      case 'invalid':
        throw new InvalidMoveError();
      case 'too_deep':
        throw new MaxDepthExceededError();
      case 'not_found':
        throw new ItemNotFoundError();
    }
  }

  /**
   * O id da pasta pedida: o da Pasta raiz, pelo atalho `root`, ou o próprio id.
   * Um texto que não é UUID é `not_found`. Se a pasta existe, quem lê confere.
   */
  private async folderIdOf(ownerId: string, id: string): Promise<string> {
    if (id === ROOT_ALIAS) {
      return this.items.ensureRoot(ownerId, uuidv7);
    }
    if (!isUUID(id)) {
      throw new ItemNotFoundError();
    }
    return id;
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

  /**
   * Toma o upload `pending` do Usuário para o expurgo (passa a `deleting`),
   * dentro da transação de quem chama, e o devolve. `null`: outro dono,
   * inexistente, id que não é UUID, já concluído ou já tomado.
   */
  claimPendingUpload(
    ownerId: string,
    id: string,
    db: Prisma.TransactionClient,
  ): Promise<PendingUpload | null> {
    return isUUID(id)
      ? this.items.claimPendingUpload(ownerId, id, db)
      : Promise.resolve(null);
  }

  /** O upload `deleting` do Usuário, que um expurgo tomou e não terminou, ou `null` (inclusive id que não é UUID). */
  findDeletingUpload(
    ownerId: string,
    id: string,
  ): Promise<PendingUpload | null> {
    return isUUID(id)
      ? this.items.findDeletingUpload(ownerId, id)
      : Promise.resolve(null);
  }

  /** O upload `pending` do Usuário com sessão no storage, ou `null` (inclusive id que não é UUID). */
  findResumableUpload(
    ownerId: string,
    id: string,
  ): Promise<ResumableUpload | null> {
    return isUUID(id)
      ? this.items.findResumableUpload(ownerId, id)
      : Promise.resolve(null);
  }

  /**
   * Ativa o Item `pending`. Devolve `false` se outra conclusão chegou antes ou
   * se o expurgo já o tomou (`deleting`).
   */
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

  /**
   * Apaga o Item `deleting`, depois de o expurgo limpar o storage. Devolve se
   * foi esta chamada que o apagou.
   */
  removeDeletingUpload(id: string): Promise<boolean> {
    return this.items.deleteDeleting(id);
  }

  /**
   * Até `limit` uploads para o expurgo, a partir do que vem depois de
   * `afterId`: os `pending` criados até `pendingBefore` e os `deleting`
   * tomados até `deletingBefore`.
   */
  listPurgeableUploads(
    pendingBefore: Date,
    deletingBefore: Date,
    afterId: string | undefined,
    limit: number,
  ): Promise<PendingUpload[]> {
    return this.items.listPurgeableUploads(
      pendingBefore,
      deletingBefore,
      afterId,
      limit,
    );
  }

  /** Guarda o endereço da sessão de upload no Item `pending`. */
  setUploadSession(id: string, uploadSessionUri: string): Promise<void> {
    return this.items.setUploadSession(id, uploadSessionUri);
  }
}
