import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth/auth.guard.js';
import { CurrentUserId } from '../../common/auth/current-user-id.decorator.js';
import { ApiProblem } from '../../common/openapi/api-problem.decorator.js';
import { CreateFolderDto } from './dto/create-folder.dto.js';
import { ItemDto } from './dto/item.dto.js';
import { ItemsService } from './items.service.js';

@ApiTags('folders')
@ApiBearerAuth()
@Controller('folders')
@UseGuards(AuthGuard)
export class FoldersController {
  constructor(private readonly items: ItemsService) {}

  @Post()
  @ApiCreatedResponse({ type: ItemDto })
  @ApiProblem(400, 'validation_error', 'max_depth_exceeded')
  @ApiProblem(401, 'unauthenticated')
  @ApiProblem(404, 'not_found')
  create(
    @Body() body: CreateFolderDto,
    @CurrentUserId() userId: string,
  ): Promise<ItemDto> {
    return this.items.createFolder(userId, body);
  }
}
