import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import {
  Item,
  ItemPosition,
  ItemType,
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

@Injectable()
export class ItemsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * O id da Pasta raiz do Usuário, que nasce aqui na primeira vez. Quem decide
   * é o índice único da raiz: com chamadas simultâneas no primeiro uso, uma
   * insere e as outras não fazem nada, e todas leem a mesma raiz depois.
   */
  async ensureRoot(ownerId: string, id: string): Promise<string> {
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
}
