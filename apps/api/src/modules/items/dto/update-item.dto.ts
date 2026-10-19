import { PickType } from '@nestjs/swagger';
import { CreateFolderDto } from './create-folder.dto.js';

/**
 * A atualização de um Item (seção 3.3 do docs/lld.md). Só o nome por ora: as
 * regras dele são as do nome de uma pasta nova.
 */
export class UpdateItemDto extends PickType(CreateFolderDto, ['name']) {}
