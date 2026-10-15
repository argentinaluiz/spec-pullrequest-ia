import { defineConfig, devices } from "@playwright/test";
import { requiredEnv } from "./e2e/support/env";

/*
 * Os testes rodam no serviço `playwright` do Compose, contra a web e a API reais, que já
 * têm de estar no ar (`pnpm dev` no contêiner `web` e `pnpm start:dev` no `api`).
 *
 * Os dois projetos, `build` e `vitrine`, e quando cada um roda contra o build de produção estão no
 * apps/web/AGENTS.md, seção "Testes no navegador".
 */

const chromium = {
  ...devices["Desktop Chrome"],
  launchOptions: {
    // O endereço público do emulador de storage é `localhost:4443`, e as URLs que a API
    // entrega valem para o navegador de quem desenvolve. Neste contêiner, `localhost` não é
    // o storage: o Chromium o resolve para o serviço `storage` (docs/lld.md, seção 4.6).
    args: ["--host-resolver-rules=MAP localhost storage"],
  },
};

/** Os arquivos da vitrine, que só existe no servidor de desenvolvimento. */
const VITRINE = "**/vitrine/**";

const devUrl = requiredEnv("WEB_URL");

/** O build de produção. Na CI, a variável é obrigatória; o servidor de desenvolvimento é só para o teste avulso. */
function buildUrl(): string {
  if (process.env.WEB_BUILD_URL) return process.env.WEB_BUILD_URL;
  if (process.env.CI) {
    throw new Error(
      "A variável WEB_BUILD_URL não está definida, e na CI o projeto build roda contra o build de produção. Rode a suíte pelo scripts/verify.sh full, que serve o build e a define.",
    );
  }
  return devUrl;
}

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
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "build",
      testIgnore: VITRINE,
      use: { ...chromium, baseURL: buildUrl() },
    },
    {
      name: "vitrine",
      testMatch: `${VITRINE}/*.spec.ts`,
      use: { ...chromium, baseURL: devUrl },
    },
  ],
});
