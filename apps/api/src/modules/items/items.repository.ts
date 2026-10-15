import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import {
  PendingUpload,
  FileUpload,
  Item,
  ItemPosition,
  ItemType,
  NewPendingFile,
  ROOT_FOLDER_NAME,
} from './entities/item.entity.js';

const ITEM_FIELDS = {
  id: true,
  type: true,
  name: true,
  sizeBytes: true,
  mimeType: true,
  updatedAt: true,
} satisfies Prisma.ItemSelect;

/** O que o cancelamento e a limpeza leem de um upload `pending` ou `deleting`. */
const PENDING_UPLOAD_FIELDS = {
  id: true,
  ownerId: true,
  status: true,
  sizeBytes: true,
  objectKey: true,
  uploadSessionUri: true,
} satisfies Prisma.ItemSelect;

function toPendingUpload(
  row: Prisma.ItemGetPayload<{ select: typeof PENDING_UPLOAD_FIELDS }>,
): PendingUpload {
  return {
    ...row,
    status: row.status as PendingUpload['status'],
    sizeBytes: Number(row.sizeBytes),
  };
}

@Injectable()
export class ItemsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * O id da Pasta raiz do Usuário, que nasce aqui na primeira vez. Depois da
   * primeira, a leitura basta. Quem garante uma raiz só é o índice único: com
   * chamadas simultâneas no primeiro uso, todas perdem a leitura, uma insere e
   * as outras não fazem nada, e todas leem a mesma raiz depois.
   */
  async ensureRoot(ownerId: string, newId: () => string): Promise<string> {
    const existing = await this.prisma.item.findFirst({
      where: { ownerId, parentId: null },
      select: { id: true },
    });
    if (existing) {
      return existing.id;
    }
    const id = newId();
    await this.prisma.$executeRaw`
      INSERT INTO items (id, owner_id, parent_id, type, name, status, updated_at)
      VALUES (${id}::uuid, ${ownerId}::uuid, NULL, 'folder', ${ROOT_FOLDER_NAME}, 'active', now())
      ON CONFLICT (owner_id) WHERE parent_id IS NULL DO NOTHING`;
    const root = await this.prisma.item.findFirstOrThrow({
      where: { ownerId, parentId: null },
      select: { id: true },
    });
    return root.id;
  }

  /**
   * Até `limit` filhos ativos da pasta, pastas primeiro e depois por nome, com
   * o id como desempate. Com `after`, começa depois dessa posição: a ordem é a
   * do índice de listagem, então a página seguinte não repete nem pula Itens.
   */
  async listActiveChildren(
    parentId: string,
    after: ItemPosition | undefined,
    limit: number,
  ): Promise<Item[]> {
    const rows = await this.prisma.item.findMany({
      where: {
        parentId,
        status: 'active',
        ...(after && {
          OR: [
            { type: { lt: after.type } },
            { type: after.type, name: { gt: after.name } },
            { type: after.type, name: after.name, id: { gt: after.id } },
          ],
        }),
      },
      orderBy: [{ type: 'desc' }, { name: 'asc' }, { id: 'asc' }],
      take: limit,
      select: ITEM_FIELDS,
    });
    return rows.map((row) => ({
      ...row,
      type: row.type as ItemType,
      sizeBytes: Number(row.sizeBytes),
    }));
  }

  /** Se o Usuário tem uma pasta ativa com esse id. */
  async hasActiveFolder(ownerId: string, id: string): Promise<boolean> {
    const folder = await this.prisma.item.findFirst({
      where: { id, ownerId, type: 'folder', status: 'active' },
      select: { id: true },
    });
    return folder !== null;
  }

  /** Cria o Item `pending` de um arquivo, invisível nas listagens. */
  async createPendingFile(
    file: NewPendingFile,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<{ createdAt: Date }> {
    const created = await db.item.create({
      data: {
        id: file.id,
        ownerId: file.ownerId,
        parentId: file.parentId,
        type: 'file',
        name: file.name,
        status: 'pending',
        sizeBytes: BigInt(file.sizeBytes),
        mimeType: file.mimeType,
        objectKey: file.objectKey,
      },
      select: { createdAt: true },
    });
    return created;
  }

  /** O arquivo do Usuário, `pending` ou `active`. Outro dono, outro tipo ou na lixeira não aparecem. */
  async findFile(ownerId: string, id: string): Promise<FileUpload | null> {
    const row = await this.prisma.item.findFirst({
      where: {
        id,
        ownerId,
        type: 'file',
        status: { in: ['pending', 'active'] },
      },
      select: {
        ...ITEM_FIELDS,
        status: true,
        objectKey: true,
        createdAt: true,
      },
    });
    if (!row || !row.objectKey) {
      return null;
    }
    return {
      ...row,
      type: 'file',
      status: row.status as FileUpload['status'],
      objectKey: row.objectKey,
      sizeBytes: Number(row.sizeBytes),
    };
  }

  /**
   * Toma o upload `pending` do Usuário para o expurgo: passa a `deleting`, numa
   * só gravação, e o devolve. A gravação renova o `updatedAt`, que passa a ser
   * o instante da tomada. Devolve `null` se ele não estava `pending` (outro
   * dono, inexistente, já concluído ou já tomado).
   */
  async claimPendingUpload(
    ownerId: string,
    id: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<PendingUpload | null> {
    const [row] = await db.item.updateManyAndReturn({
      where: { id, ownerId, type: 'file', status: 'pending' },
      data: { status: 'deleting' },
      select: PENDING_UPLOAD_FIELDS,
    });
    return row ? toPendingUpload(row) : null;
  }

  /** O upload `deleting` do Usuário, que o expurgo tomou e não terminou, ou `null`. */
  async findDeletingUpload(
    ownerId: string,
    id: string,
  ): Promise<PendingUpload | null> {
    const row = await this.prisma.item.findFirst({
      where: { id, ownerId, type: 'file', status: 'deleting' },
      select: PENDING_UPLOAD_FIELDS,
    });
    return row && toPendingUpload(row);
  }

  /**
   * Ativa o Item `pending`. Devolve `false` se ele já não estava `pending`,
   * inclusive o que o expurgo já tomou (`deleting`), que nunca é ativado.
   */
  async activatePending(id: string): Promise<boolean> {
    const { count } = await this.prisma.item.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'active', uploadSessionUri: null },
    });
    return count > 0;
  }

  /** Apaga o Item `pending`. Devolve `false` se ele já não existia ou já não estava `pending`. */
  async deletePending(
    id: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<boolean> {
    const { count } = await db.item.deleteMany({
      where: { id, status: 'pending' },
    });
    return count > 0;
  }

  /** Apaga o Item `deleting`. Devolve `false` se ele já não existia. */
  async deleteDeleting(id: string): Promise<boolean> {
    const { count } = await this.prisma.item.deleteMany({
      where: { id, status: 'deleting' },
    });
    return count > 0;
  }

  /**
   * Até `limit` uploads que o expurgo deve remover, em ordem de id, a partir do
   * que vem depois de `afterId`: os `pending` criados até `pendingBefore` e os
   * `deleting` tomados (`updatedAt`) até `deletingBefore`, que um expurgo
   * anterior não terminou. O índice parcial dos pendentes atende o filtro.
   */
  async listPurgeableUploads(
    pendingBefore: Date,
    deletingBefore: Date,
    afterId: string | undefined,
    limit: number,
  ): Promise<PendingUpload[]> {
    const rows = await this.prisma.item.findMany({
      where: {
        type: 'file',
        OR: [
          { status: 'pending', createdAt: { lte: pendingBefore } },
          { status: 'deleting', updatedAt: { lte: deletingBefore } },
        ],
        ...(afterId && { id: { gt: afterId } }),
      },
      orderBy: { id: 'asc' },
      take: limit,
      select: PENDING_UPLOAD_FIELDS,
    });
    return rows.map(toPendingUpload);
  }

  /** Guarda o endereço da sessão de upload no Item `pending`. */
  async setUploadSession(id: string, uploadSessionUri: string): Promise<void> {
    await this.prisma.item.updateMany({
      where: { id, status: 'pending' },
      data: { uploadSessionUri },
    });
  }
}
