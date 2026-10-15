import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { v4 as uuidv4, v7 as uuidv7 } from 'uuid';
import { appConfig } from '../../config/app.config.js';
import { uploadsConfig } from '../../config/uploads.config.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import {
  FILE_STORAGE,
  type FileStorage,
} from '../../infra/storage/file-storage.js';
import type { PendingUpload, Item } from '../items/entities/item.entity.js';
import { ItemNotFoundError } from '../items/errors/item-not-found.error.js';
import { ItemsService } from '../items/items.service.js';
import { QuotaService } from '../quota/quota.service.js';
import { FileTooLargeError } from './errors/file-too-large.error.js';
import { UploadIncompleteError } from './errors/upload-incomplete.error.js';
import { UploadSizeMismatchError } from './errors/upload-size-mismatch.error.js';

/** 5 GB são 5 GiB, como os 15 GB do plano gratuito são 15 GiB. O limite é inclusivo. */
const MAX_FILE_BYTES = 5 * 1024 ** 3;

/** Tipo do arquivo quando o pedido não diz qual é. */
const DEFAULT_MIME_TYPE = 'application/octet-stream';

/** Quantos uploads vencidos a limpeza lê por vez. */
const CLEANUP_BATCH_SIZE = 100;

/** O resultado de uma limpeza: quantos pendentes saíram e em quantos o storage falhou. */
export interface PendingCleanupResult {
  removed: number;
  failed: number;
}

export interface StartedUpload {
  itemId: string;
  uploadUrl: string;
  expiresAt: Date;
}

/** O envio de arquivos: o início, que reserva a Cota, e a conclusão, que confere o objeto no storage. */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly items: ItemsService,
    private readonly quota: QuotaService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @Inject(appConfig.KEY) private readonly app: ConfigType<typeof appConfig>,
    @Inject(uploadsConfig.KEY)
    private readonly config: ConfigType<typeof uploadsConfig>,
  ) {}

  /**
   * Reserva o espaço, cria o Item `pending` e a sessão de upload no storage
   * (seção 4.6 do docs/lld.md). O storage é chamado fora da transação, para
   * ela não ficar presa a uma chamada de rede.
   */
  async start(
    userId: string,
    input: {
      name: string;
      sizeBytes: number;
      mimeType?: string;
      parentId: string;
    },
  ): Promise<StartedUpload> {
    if (input.sizeBytes > MAX_FILE_BYTES) {
      throw new FileTooLargeError();
    }
    const parentId = await this.items.resolveDestinationFolder(
      userId,
      input.parentId,
    );
    const mimeType = input.mimeType || DEFAULT_MIME_TYPE;
    const itemId = uuidv7();
    const objectKey = uuidv4();

    const { createdAt } = await this.prisma.$transaction(async (tx) => {
      await this.quota.reserve(userId, input.sizeBytes, tx);
      return this.items.createPendingFile(
        {
          id: itemId,
          ownerId: userId,
          parentId,
          name: input.name,
          sizeBytes: input.sizeBytes,
          mimeType,
          objectKey,
        },
        tx,
      );
    });

    try {
      const uploadUrl = await this.storage.createUploadSession({
        objectName: objectKey,
        mimeType,
        origin: this.app.webOrigin,
      });
      await this.items.setUploadSession(itemId, uploadUrl);
      return {
        itemId,
        uploadUrl,
        expiresAt: new Date(createdAt.getTime() + this.config.pendingTtlMs),
      };
    } catch (error) {
      await this.discardPending(userId, itemId, input.sizeBytes).catch(
        () => undefined,
      );
      throw error;
    }
  }

  /**
   * Confere o objeto no storage e ativa o Item. Um Item já ativo é devolvido
   * como está, e a conclusão repetida ou simultânea devolve o mesmo Item.
   */
  async complete(userId: string, itemId: string): Promise<Item> {
    const file = await this.items.findFile(userId, itemId);
    if (!file) {
      throw new ItemNotFoundError();
    }
    if (file.status === 'active') {
      return toItem(file);
    }
    if (file.status === 'pending') {
      const size = await this.storage.getObjectSize(file.objectKey);
      if (size === null) {
        throw new UploadIncompleteError();
      }
      if (size !== file.sizeBytes) {
        // O objeto sai primeiro: se o storage falhar, nada muda e a limpeza resolve depois.
        await this.storage.deleteObject(file.objectKey);
        await this.discardPending(userId, itemId, file.sizeBytes);
        throw new UploadSizeMismatchError();
      }
      // Se outra conclusão ativou antes, esta só relê o Item.
      await this.items.activatePending(itemId);
    }
    const active = await this.items.findFile(userId, itemId);
    if (!active) {
      throw new ItemNotFoundError();
    }
    return toItem(active);
  }

  /**
   * Cancela o upload `pending` do Usuário: o Item sai primeiro, só se ainda
   * está `pending`, junto com o espaço, e o storage depois. Assim uma conclusão
   * simultânea ou ganha antes (e o cancelamento é `not_found`, com o objeto
   * intacto) ou encontra o Item apagado. Outro dono, inexistente ou que já não
   * está `pending` é `not_found`. Uma falha do storage depois disso só é
   * registrada: o cancelamento já valeu.
   */
  async cancel(userId: string, itemId: string): Promise<void> {
    const upload = await this.items.findPendingUpload(userId, itemId);
    if (
      !upload ||
      !(await this.discardPending(userId, upload.id, upload.sizeBytes))
    ) {
      throw new ItemNotFoundError();
    }
    try {
      if (upload.uploadSessionUri) {
        await this.storage.cancelUploadSession(upload.uploadSessionUri);
      }
      if (upload.objectKey) {
        await this.storage.deleteObject(upload.objectKey);
      }
    } catch (error) {
      this.logger.error(
        `Upload ${upload.id} cancelado, mas o objeto ${upload.objectKey ?? '(sem chave)'} ficou no storage: ${String(error)}`,
      );
    }
  }

  /** Remove os uploads `pending` vencidos, na ordem do expurgo (seção 5 do docs/lld.md). */
  async cleanupPending(): Promise<PendingCleanupResult> {
    const before = new Date(Date.now() - this.config.pendingTtlMs);
    const result: PendingCleanupResult = { removed: 0, failed: 0 };
    let afterId: string | undefined;
    let batch: PendingUpload[];
    do {
      batch = await this.items.listExpiredPending(
        before,
        afterId,
        CLEANUP_BATCH_SIZE,
      );
      for (const upload of batch) {
        try {
          if ((await this.removePending(upload)) === 'removed') {
            result.removed += 1;
          }
        } catch (error) {
          this.logger.warn(
            `Upload pendente ${upload.id} fica para a próxima limpeza: ${String(error)}`,
          );
          result.failed += 1;
        }
      }
      afterId = batch.at(-1)?.id;
    } while (batch.length === CLEANUP_BATCH_SIZE);
    return result;
  }

  /**
   * Apaga um upload `pending`: o storage primeiro, depois o Item e o espaço.
   * Devolve `skipped` se uma conclusão o ativou no meio do caminho. Um erro do
   * storage ou do banco sobe, e o Item continua `pending`.
   */
  private async removePending(
    upload: PendingUpload,
  ): Promise<'removed' | 'skipped'> {
    if (upload.uploadSessionUri) {
      await this.storage.cancelUploadSession(upload.uploadSessionUri);
    }
    // Estreita a janela: uma conclusão que ativou o Item desde a leitura poupa o objeto.
    const current = await this.items.findFile(upload.ownerId, upload.id);
    if (current?.status !== 'pending') {
      return 'skipped';
    }
    if (upload.objectKey) {
      await this.storage.deleteObject(upload.objectKey);
    }
    // Uma conclusão que ativou o Item no meio do caminho não o perde: só apaga `pending`.
    const removed = await this.discardPending(
      upload.ownerId,
      upload.id,
      upload.sizeBytes,
    );
    return removed ? 'removed' : 'skipped';
  }

  /**
   * Apaga o Item `pending` e devolve o espaço, só se foi esta chamada que o
   * apagou. Devolve se foi.
   */
  private discardPending(
    userId: string,
    itemId: string,
    sizeBytes: number,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const removed = await this.items.removePending(itemId, tx);
      if (removed) {
        await this.quota.release(userId, sizeBytes, tx);
      }
      return removed;
    });
  }
}

/** O Item que a API devolve, sem os campos internos do arquivo (a chave do objeto, por exemplo). */
function toItem(file: {
  id: string;
  type: Item['type'];
  name: string;
  sizeBytes: number;
  mimeType: string | null;
  updatedAt: Date;
}): Item {
  return {
    id: file.id,
    type: file.type,
    name: file.name,
    sizeBytes: file.sizeBytes,
    mimeType: file.mimeType,
    updatedAt: file.updatedAt,
  };
}
