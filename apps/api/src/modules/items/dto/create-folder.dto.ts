import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { IsFileName } from '../../../common/validation/file-name.decorator.js';

/** A criação de uma pasta (seção 3.3 do docs/lld.md). */
export class CreateFolderDto {
  /** Sem os espaços das pontas: o tamanho vale depois de descartá-los. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(1)
  @MaxLength(255)
  @IsFileName()
  name: string;

  /** `root` ou o id de uma pasta ativa do Usuário. */
  @IsString()
  @IsNotEmpty()
  parentId: string;
}
