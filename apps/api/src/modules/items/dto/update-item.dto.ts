import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsFileName } from '../../../common/validation/file-name.decorator.js';

/**
 * A atualização de um Item (seção 3.3 do docs/lld.md): o nome, o novo pai, ou
 * os dois. Ao menos um dos campos é obrigatório, o que o service confere. As
 * regras do nome são as do nome de uma pasta nova.
 */
export class UpdateItemDto {
  /** Sem os espaços das pontas: o tamanho vale depois de descartá-los. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(1)
  @MaxLength(255)
  @IsFileName()
  name?: string;

  /** `root` ou o id de uma pasta ativa do Usuário. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  parentId?: string;
}
