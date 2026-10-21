import { PartialType, PickType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CreateFolderDto } from './create-folder.dto.js';

/**
 * A atualização de um Item (seção 3.3 do docs/lld.md): o nome, o novo pai, ou
 * os dois. Ao menos um dos campos é obrigatório, o que o service confere. As
 * regras do nome são as do nome de uma pasta nova.
 */
export class UpdateItemDto extends PartialType(
  PickType(CreateFolderDto, ['name']),
) {
  /** `root` ou o id de uma pasta ativa do Usuário. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  parentId?: string;
}
