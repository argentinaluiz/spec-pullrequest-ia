import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsFileName } from '../../../common/validation/file-name.decorator.js';

/** O início do envio de um arquivo (seção 3.4 do docs/lld.md). */
export class CreateUploadDto {
  @MinLength(1)
  @MaxLength(255)
  @IsFileName()
  name: string;

  @IsInt()
  @Min(0)
  sizeBytes: number;

  /** Vazio ou ausente vira `application/octet-stream`. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  mimeType?: string;

  /** `root` ou o id de uma pasta ativa do Usuário. */
  @IsString()
  @IsNotEmpty()
  parentId: string;
}
