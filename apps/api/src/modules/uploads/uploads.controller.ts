import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth/auth.guard.js';
import { CurrentUserId } from '../../common/auth/current-user-id.decorator.js';
import { ApiProblem } from '../../common/openapi/api-problem.decorator.js';
import { ItemDto } from '../items/dto/item.dto.js';
import { CreateUploadDto } from './dto/create-upload.dto.js';
import { UploadDto } from './dto/upload.dto.js';
import { UploadsService } from './uploads.service.js';

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
@UseGuards(AuthGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  @ApiCreatedResponse({ type: UploadDto })
  @ApiProblem(400, 'validation_error')
  @ApiProblem(401, 'unauthenticated')
  @ApiProblem(404, 'not_found')
  @ApiProblem(413, 'file_too_large', 'quota_exceeded')
  create(
    @Body() body: CreateUploadDto,
    @CurrentUserId() userId: string,
  ): Promise<UploadDto> {
    return this.uploads.start(userId, body);
  }

  @Post(':itemId/complete')
  @HttpCode(200)
  @ApiOkResponse({ type: ItemDto })
  @ApiProblem(401, 'unauthenticated')
  @ApiProblem(404, 'not_found')
  @ApiProblem(409, 'upload_size_mismatch', 'upload_incomplete')
  complete(
    @Param('itemId') itemId: string,
    @CurrentUserId() userId: string,
  ): Promise<ItemDto> {
    return this.uploads.complete(userId, itemId);
  }
}
