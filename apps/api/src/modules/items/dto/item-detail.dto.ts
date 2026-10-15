import type { ItemDetail, ItemTrailEntry } from '../entities/item.entity.js';
import { ItemDto } from './item.dto.js';

/** Um trecho do caminho do topo até a pasta. */
export class ItemTrailEntryDto implements ItemTrailEntry {
  id: string;
  name: string;
}

/** Uma pasta e o caminho do topo, a Pasta raiz, até ela. */
export class ItemDetailDto implements ItemDetail {
  item: ItemDto;
  trail: ItemTrailEntryDto[];
}
