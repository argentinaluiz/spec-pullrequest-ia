import type { DownloadUrl } from '../entities/item.entity.js';

/** A URL assinada de leitura de um arquivo, com o instante em que ela vence. */
export class DownloadUrlDto implements DownloadUrl {
  url: string;
  expiresAt: Date;
}
