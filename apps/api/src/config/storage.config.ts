import { registerAs } from '@nestjs/config';
import { validatedEnv } from './env.js';

export const storageConfig = registerAs('storage', () => {
  const env = validatedEnv();
  return {
    bucket: env.GCS_BUCKET,
    /** Endereço do emulador de storage que a API alcança. Ausente em produção. */
    emulatorHost: env.STORAGE_EMULATOR_HOST,
    /** Origem do emulador que o navegador alcança. Ausente em produção. */
    publicUrl: env.STORAGE_PUBLIC_URL,
    /** Credencial de assinatura das URLs, só no desenvolvimento. */
    signer:
      env.STORAGE_SIGNER_EMAIL && env.STORAGE_SIGNER_PRIVATE_KEY
        ? {
            email: env.STORAGE_SIGNER_EMAIL,
            privateKey: env.STORAGE_SIGNER_PRIVATE_KEY,
          }
        : undefined,
  };
});
