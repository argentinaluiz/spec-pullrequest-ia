import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/** Itens por página quando o pedido não traz `limit`. */
export const DEFAULT_PAGE_SIZE = 50;

/** Paginação por cursor da listagem de uma pasta (seção 3.1 do docs/lld.md). */
export class ListChildrenQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = DEFAULT_PAGE_SIZE;

  /** Opaco: o cliente só o devolve como recebeu no `nextCursor`. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cursor?: string;

  /** Só `folder`: devolve apenas as pastas. Ausente, devolve pastas e arquivos. */
  @IsOptional()
  @IsIn(['folder'])
  type?: 'folder';
}
