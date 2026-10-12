import { defineConfig, mergeConfig } from 'vitest/config';
import { baseConfig } from './vitest.shared.js';

// Suíte de unidade: `*.spec.ts`, ao lado do código. Não usa banco nem e-mail.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ['src/**/*.spec.ts'],
    },
  }),
);
