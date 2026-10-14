import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { v4 as uuidv4, v7 as uuidv7 } from 'uuid';
import { appConfig } from '../../config/app.config.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import {
  FILE_STORAGE,
  type FileStorage,
} from '../../infra/storage/file-storage.js';
import type { Item } from '../items/entities/item.entity.js';
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

/** Quanto tempo o upload fica pendente: o prazo em que a limpeza o remove (seção 5 do docs/lld.md). */
const PENDING_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

export interface StartedUpload {
  itemId: string;
  uploadUrl: string;
  expiresAt: Date;
}

/** O envio de arquivos: o início, que reserva a Cota, e a conclusão, que confere o objeto no storage. */
@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly items: ItemsService,
    private readonly quota: QuotaService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @Inject(appConfig.KEY) private readonly app: ConfigType<typeof appConfig>,
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
        expiresAt: new Date(createdAt.getTime() + PENDING_UPLOAD_TTL_MS),
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

  /** Apaga o Item `pending` e devolve o espaço, só se foi esta chamada que o apagou. */
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
