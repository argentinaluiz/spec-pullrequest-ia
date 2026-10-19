import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Suíte de unidade: `*.spec.ts` e `*.spec.tsx` ao lado do código, em qualquer pasta menos `e2e/`. Roda em Node, sem navegador e sem a
// aplicação no ar. O que depende do navegador fica na suíte do Playwright (`e2e/`).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    // O ID de critério de aceite é a tag do teste; o motivo do `strictTags: false` está na
    // "Cobertura" do AGENTS.md da raiz.
    strictTags: false,
    include: ["**/*.spec.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
  },
});
