import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth/auth.guard.js';
import { CurrentUserId } from '../../common/auth/current-user-id.decorator.js';
import { ApiProblem } from '../../common/openapi/api-problem.decorator.js';
import { DownloadUrlDto } from './dto/download-url.dto.js';
import { ItemListDto } from './dto/item-list.dto.js';
import {
  DEFAULT_PAGE_SIZE,
  ListChildrenQueryDto,
} from './dto/list-children-query.dto.js';
import { ItemsService } from './items.service.js';

@ApiTags('items')
@ApiBearerAuth()
@Controller('items')
@UseGuards(AuthGuard)
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get(':id/children')
  @ApiOkResponse({ type: ItemListDto })
  @ApiProblem(400, 'validation_error')
  @ApiProblem(401, 'unauthenticated')
  @ApiProblem(404, 'not_found')
  listChildren(
    @Param('id') id: string,
    @Query() query: ListChildrenQueryDto,
    @CurrentUserId() userId: string,
  ): Promise<ItemListDto> {
    return this.items.listChildren(userId, id, {
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
      cursor: query.cursor,
    });
  }

  @Get(':id/download-url')
  @ApiOkResponse({ type: DownloadUrlDto })
  @ApiProblem(401, 'unauthenticated')
  @ApiProblem(404, 'not_found')
  downloadUrl(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
  ): Promise<DownloadUrlDto> {
    return this.items.downloadUrl(userId, id);
  }
}
