import type { Item } from '../entities/item.entity.js';

/** Um Item da listagem de uma pasta. */
export class ItemDto implements Item {
  id: string;
  type: 'file' | 'folder';
  name: string;
  sizeBytes: number;
  mimeType: string | null;
  /** Data de modificação, que a lista mostra. */
  updatedAt: Date;
}
