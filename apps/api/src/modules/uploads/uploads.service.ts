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

/**
 * Quanto tempo depois da tomada a limpeza termina um upload `deleting`: antes
 * disso, o expurgo que o tomou pode ainda estar limpando o storage (seção 5 do
 * docs/lld.md).
 */
const DELETING_GRACE_MS = 15 * 60 * 1000;

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
   * como está, e a conclusão repetida ou simultânea devolve o mesmo Item. Sem
   * o objeto, o Item é relido: se um expurgo o tomou no meio da conclusão, ele
   * não está mais `pending`, e a resposta é `not_found`, e não
   * `upload_incomplete`.
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
        const current = await this.items.findFile(userId, itemId);
        if (!current) {
          throw new ItemNotFoundError();
        }
        if (current.status === 'pending') {
          throw new UploadIncompleteError();
        }
        return toItem(current);
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
   * Cancela o upload do Usuário pelo expurgo, com a ordem e o efeito de uma
   * falha do storage descritos no docs/lld.md, seção 4.6 ("Ordem do
   * expurgo"). Um upload que um expurgo anterior deixou em `deleting` é
   * terminado. Outro dono, inexistente, já concluído ou já removido é
   * `not_found`.
   */
  async cancel(userId: string, itemId: string): Promise<void> {
    const upload =
      (await this.claim(userId, itemId)) ??
      (await this.items.findDeletingUpload(userId, itemId));
    if (!upload) {
      throw new ItemNotFoundError();
    }
    await this.purge(upload);
  }

  /**
   * Remove pelo expurgo os uploads `pending` vencidos e os que ficaram em
   * `deleting` há mais que o prazo de carência (seção 4.6 do docs/lld.md,
   * "Ordem do expurgo", e seção 5). O `pending` listado ainda é tomado, e
   * sai da contagem se uma conclusão ou outro expurgo chegou antes; o
   * `deleting` já foi tomado e segue direto para o storage. Só conta o
   * upload cuja linha esta limpeza apagou.
   */
  async cleanupPending(): Promise<PendingCleanupResult> {
    const now = Date.now();
    const pendingBefore = new Date(now - this.config.pendingTtlMs);
    const deletingBefore = new Date(now - DELETING_GRACE_MS);
    const result: PendingCleanupResult = { removed: 0, failed: 0 };
    let afterId: string | undefined;
    let batch: PendingUpload[];
    do {
      batch = await this.items.listPurgeableUploads(
        pendingBefore,
        deletingBefore,
        afterId,
        CLEANUP_BATCH_SIZE,
      );
      for (const listed of batch) {
        try {
          const claimed =
            listed.status === 'pending'
              ? await this.claim(listed.ownerId, listed.id)
              : listed;
          if (claimed && (await this.purge(claimed))) {
            result.removed += 1;
          }
        } catch (error) {
          this.logger.warn(
            `Upload ${listed.id} fica em remoção para a próxima limpeza: ${String(error)}`,
          );
          result.failed += 1;
        }
      }
      afterId = batch.at(-1)?.id;
    } while (batch.length === CLEANUP_BATCH_SIZE);
    return result;
  }

  /**
   * Os passos 2 e 3 do expurgo de um upload já tomado (`deleting`), na ordem
   * do docs/lld.md, seção 4.6 ("Ordem do expurgo"): limpa o storage sem
   * transação aberta e só então apaga o Item. Devolve se foi esta chamada que
   * apagou a linha: `false` quando outro expurgo a terminou antes. Uma falha
   * do storage sobe, e o Item fica `deleting`, com a Cota já devolvida.
   */
  private async purge(upload: PendingUpload): Promise<boolean> {
    await this.removeFromStorage(upload);
    return this.items.removeDeletingUpload(upload.id);
  }

  /**
   * Numa transação curta, passa o upload `pending` a `deleting` e devolve a
   * Cota dele. Só quem o tomou devolve, então dois expurgos simultâneos não
   * devolvem duas vezes.
   */
  private claim(userId: string, itemId: string): Promise<PendingUpload | null> {
    return this.prisma.$transaction(async (tx) => {
      const upload = await this.items.claimPendingUpload(userId, itemId, tx);
      if (upload) {
        await this.quota.release(userId, upload.sizeBytes, tx);
      }
      return upload;
    });
  }

  /**
   * Cancela a sessão e apaga o objeto do upload, nessa ordem. Uma remoção não
   * depende da outra: se a sessão falhar, o objeto ainda é apagado, e a
   * primeira falha sobe no fim.
   */
  private async removeFromStorage(upload: PendingUpload): Promise<void> {
    let failure: unknown;
    if (upload.uploadSessionUri) {
      await this.storage
        .cancelUploadSession(upload.uploadSessionUri)
        .catch((error: unknown) => {
          failure ??= error;
        });
    }
    if (upload.objectKey) {
      await this.storage
        .deleteObject(upload.objectKey)
        .catch((error: unknown) => {
          failure ??= error;
        });
    }
    if (failure !== undefined) {
      throw failure;
    }
  }

  /**
   * Apaga o Item `pending` e devolve o espaço, só se foi esta chamada que o
   * apagou.
   */
  private discardPending(
    userId: string,
    itemId: string,
    sizeBytes: number,
  ): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      if (await this.items.removePending(itemId, tx)) {
        await this.quota.release(userId, sizeBytes, tx);
      }
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
