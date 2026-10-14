import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { ItemPage } from './entities/item.entity.js';
import { ItemNotFoundError } from './errors/item-not-found.error.js';
import { decodeItemCursor, encodeItemCursor } from './item-cursor.js';
import { ItemsRepository } from './items.repository.js';

/** O atalho da Pasta raiz do Usuário, aceito no lugar do id de uma pasta. */
const ROOT_ALIAS = 'root';

/**
 * Service público do módulo de itens, dono dos Itens e da Pasta raiz.
 */
@Injectable()
export class ItemsService {
  constructor(private readonly items: ItemsRepository) {}

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
    const after = page.cursor ? decodeItemCursor(page.cursor) : undefined;
    const rootId = await this.items.ensureRoot(ownerId, uuidv7());
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
}
