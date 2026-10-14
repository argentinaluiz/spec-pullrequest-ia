import { defineConfig, devices } from "@playwright/test";
import { requiredEnv } from "./e2e/support/env";

/*
 * Os testes rodam no serviço `playwright` do Compose, contra a web e a API reais, que já
 * têm de estar no ar (`pnpm dev` no contêiner `web` e `pnpm start:dev` no `api`).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Na CI, o teste que falha tem uma nova tentativa. Se passar nela, vira aviso no PR.
  retries: process.env.CI ? 1 : 0,
  // O JSON é a evidência que o scripts/verify.sh confere.
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["json", { outputFile: "reports/playwright.json" }],
  ],
  use: {
    baseURL: requiredEnv("WEB_URL"),
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          // O endereço público do emulador de storage é `localhost:4443`, e as URLs que a API
          // entrega valem para o navegador de quem desenvolve. Neste contêiner, `localhost` não é
          // o storage: o Chromium o resolve para o serviço `storage` (docs/lld.md, seção 4.6).
          args: ["--host-resolver-rules=MAP localhost storage"],
        },
      },
    },
  ],
});
