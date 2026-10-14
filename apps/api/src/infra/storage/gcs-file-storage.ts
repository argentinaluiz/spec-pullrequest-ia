import { Bucket, Storage } from '@google-cloud/storage';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { storageConfig } from '../../config/storage.config.js';
import {
  CreateUploadSessionInput,
  FileStorage,
  SignReadUrlInput,
  StorageUnavailableError,
} from './file-storage.js';

const DEFAULT_READ_URL_TTL_SECONDS = 5 * 60;

/** O erro do SDK que diz que o objeto não existe. */
function isNotFound(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 404;
}

/** `Content-Disposition` de download, com o nome em UTF-8 (RFC 6266 e 5987). */
function attachmentDisposition(fileName: string): string {
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename*=UTF-8''${encoded}`;
}

/**
 * O SDK lê `STORAGE_EMULATOR_HOST` do ambiente por conta própria e, quando ela existe, usa o valor
 * como endereço-base das chamadas, sem o `/storage/v1`: contra o `fake-gcs-server`, todas dão 404
 * (verificado na versão 8.4.0). O endereço vem da configuração (`apiEndpoint`), então o SDK
 * é criado com a variável fora do ambiente, que volta logo em seguida.
 */
function withoutSdkEmulatorVariable<T>(create: () => T): T {
  const previous = process.env.STORAGE_EMULATOR_HOST;
  delete process.env.STORAGE_EMULATOR_HOST;
  try {
    return create();
  } finally {
    if (previous !== undefined) {
      process.env.STORAGE_EMULATOR_HOST = previous;
    }
  }
}

/**
 * Driver do Cloud Storage. No ambiente local, o servidor é o `fake-gcs-server`, e a origem
 * pública (`STORAGE_PUBLIC_URL`) substitui a do emulador nos endereços que vão ao navegador
 * (docs/lld.md, seção 4.6).
 */
@Injectable()
export class GcsFileStorage implements FileStorage {
  private readonly bucket: Bucket;

  constructor(
    @Inject(storageConfig.KEY)
    private readonly config: ConfigType<typeof storageConfig>,
  ) {
    this.bucket = withoutSdkEmulatorVariable(
      () =>
        new Storage(
          config.emulatorHost
            ? {
                apiEndpoint: config.emulatorHost,
                projectId: 'local',
                credentials: config.signer && {
                  client_email: config.signer.email,
                  private_key: config.signer.privateKey,
                },
              }
            : {},
        ),
    ).bucket(config.bucket);
  }

  async createUploadSession(input: CreateUploadSessionInput): Promise<string> {
    try {
      const [sessionUrl] = await this.bucket
        .file(input.objectName)
        .createResumableUpload({
          origin: input.origin,
          metadata: { contentType: input.mimeType },
        });
      return this.toPublicUrl(sessionUrl);
    } catch (error) {
      throw new StorageUnavailableError({ cause: error });
    }
  }

  async signReadUrl(input: SignReadUrlInput): Promise<string> {
    const expiresInSeconds =
      input.expiresInSeconds ?? DEFAULT_READ_URL_TTL_SECONDS;
    try {
      const [url] = await this.bucket.file(input.objectName).getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + expiresInSeconds * 1000,
        responseDisposition: attachmentDisposition(input.fileName),
        // Com o emulador, a URL já sai com a origem que o navegador alcança.
        host: this.config.publicUrl,
      });
      return url;
    } catch (error) {
      throw new StorageUnavailableError({ cause: error });
    }
  }

  async getObjectSize(objectName: string): Promise<number | null> {
    try {
      const [metadata] = await this.bucket.file(objectName).getMetadata();
      const size = Number(metadata.size);
      if (!Number.isFinite(size)) {
        throw new Error('O storage não informou o tamanho do objeto');
      }
      return size;
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw new StorageUnavailableError({ cause: error });
    }
  }

  async deleteObject(objectName: string): Promise<void> {
    try {
      await this.bucket.file(objectName).delete({ ignoreNotFound: true });
    } catch (error) {
      throw new StorageUnavailableError({ cause: error });
    }
  }

  async cancelUploadSession(sessionUrl: string): Promise<void> {
    try {
      const response = await fetch(this.toInternalUrl(sessionUrl), {
        method: 'DELETE',
        headers: { 'Content-Length': '0' },
        signal: AbortSignal.timeout(10_000),
      });
      // O Cloud Storage responde 499 ao cancelamento. 404 e 410: a sessão já terminou ou expirou.
      if (![499, 404, 410].includes(response.status)) {
        throw new Error(
          `O cancelamento da sessão respondeu ${response.status}`,
        );
      }
    } catch (error) {
      throw new StorageUnavailableError({ cause: error });
    }
  }

  /** O inverso de `toPublicUrl`: o endereço que a API alcança, a partir do que foi entregue ao navegador. */
  private toInternalUrl(url: string): string {
    if (!this.config.publicUrl || !this.config.emulatorHost) {
      return url;
    }
    return replaceOrigin(url, this.config.emulatorHost);
  }

  /** O endereço que o navegador alcança, no lugar do que a API usa para falar com o emulador. */
  private toPublicUrl(url: string): string {
    return this.config.publicUrl
      ? replaceOrigin(url, this.config.publicUrl)
      : url;
  }
}

/** A mesma URL, com o protocolo e o host de `origin`. */
function replaceOrigin(url: string, origin: string): string {
  const target = new URL(origin);
  const converted = new URL(url);
  converted.protocol = target.protocol;
  converted.host = target.host;
  return converted.toString();
}
