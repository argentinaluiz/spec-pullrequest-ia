import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  ProbeObjectQueryDto,
  ProbeReadUrlQueryDto,
  ProbeSessionBodyDto,
} from './storage-probe.dto.js';
import { StorageProbeService } from './storage-probe.service.js';

/**
 * Rotas de apoio dos testes no navegador contra o emulador de storage. Ficam fora do contrato
 * (OpenAPI) e saem quando o `POST /uploads` existir (LUI-167).
 */
@ApiExcludeController()
@Controller('dev/storage')
export class StorageProbeController {
  constructor(private readonly probe: StorageProbeService) {}

  @Post('session')
  createSession(@Body() body: ProbeSessionBodyDto) {
    return this.probe.createSession(body.objectName, body.mimeType);
  }

  @Get('read-url')
  readUrl(@Query() query: ProbeReadUrlQueryDto) {
    return this.probe.readUrl(query.objectName, query.fileName);
  }

  @Get('size')
  size(@Query() query: ProbeObjectQueryDto) {
    return this.probe.size(query.objectName);
  }

  @Delete('object')
  @HttpCode(204)
  deleteObject(@Query() query: ProbeObjectQueryDto): Promise<void> {
    return this.probe.deleteObject(query.objectName);
  }
}
