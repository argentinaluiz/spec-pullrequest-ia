import { Controller, Get, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ProbeReadUrlQueryDto } from './storage-probe.dto.js';
import { StorageProbeService } from './storage-probe.service.js';

/**
 * Rota de apoio dos testes no navegador contra o emulador de storage. Fica fora do contrato
 * (OpenAPI) e sai quando a rota de download existir (LUI-168): até lá, nenhuma rota entrega a
 * URL de leitura de um arquivo.
 */
@ApiExcludeController()
@Controller('dev/storage')
export class StorageProbeController {
  constructor(private readonly probe: StorageProbeService) {}

  @Get('read-url')
  readUrl(@Query() query: ProbeReadUrlQueryDto) {
    return this.probe.readUrl(query.objectName, query.fileName);
  }
}
