import type { ItemPage } from '../entities/item.entity.js';
import { ItemDto } from './item.dto.js';

/** Uma página da listagem de uma pasta. `nextCursor` é nulo na última. */
export class ItemListDto implements ItemPage {
  items: ItemDto[];
  nextCursor: string | null;
}
