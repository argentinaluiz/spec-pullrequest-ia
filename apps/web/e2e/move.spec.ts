import { expect, test, type Page } from "@playwright/test";
import { rowOf } from "./support/rows";
import { signIn } from "./support/account";
import {
  seedFilesIn,
  seedFolder,
  seedFolderChain,
  seedRootFiles,
} from "./support/items";
import { uniqueEmail } from "./support/mailpit";

/** Abre o diálogo de mover a partir do menu "Mais ações" da linha. */
async function openMove(page: Page, name: string) {
  await rowOf(page, name).getByRole("button", { name: "Mais ações" }).click();
  await page.getByRole("menuitem", { name: "Mover para…" }).click();
  return page.getByRole("dialog", { name: "Mover para…" });
}

test(
  "o Usuário move um arquivo e uma pasta pelo diálogo Mover para…",
  { tag: "@LUI-181-CA8" },
  async ({ page }) => {
    const email = uniqueEmail();
    await signIn(page, email);
    const projects = await seedFolder(email, "Projetos");
    await seedFolder(email, "Fotos");
    await seedRootFiles(email, [{ name: "relatorio.txt" }]);
    await page.reload();

    const dialog = await openMove(page, "relatorio.txt");
    await dialog.getByRole("button", { name: "Projetos" }).click();
    await dialog.getByRole("button", { name: "Mover", exact: true }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("Movido para “Projetos”.");
    await expect(rowOf(page, "relatorio.txt")).toHaveCount(0);

    const folderDialog = await openMove(page, "Fotos");
    await folderDialog.getByRole("button", { name: "Projetos" }).click();
    await folderDialog.getByRole("button", { name: "Mover", exact: true }).click();

    await expect(folderDialog).toHaveCount(0);
    await expect(rowOf(page, "Fotos")).toHaveCount(0);
    await page.goto(`/pasta/${projects}`);
    await expect(rowOf(page, "Fotos")).toHaveCount(1);
    await expect(rowOf(page, "relatorio.txt")).toHaveCount(1);
  },
);

test(
  "o seletor mostra só pastas e desabilita a pasta movida",
  { tag: "@LUI-181-CA9" },
  async ({ page }) => {
    const email = uniqueEmail();
    await signIn(page, email);
    const photos = await seedFolder(email, "Fotos");
    await seedFolder(email, "Viagens", photos);
    await seedFolder(email, "Projetos");
    await seedRootFiles(email, [{ name: "relatorio.txt" }]);
    await page.reload();

    const dialog = await openMove(page, "Fotos");
    const folders = dialog.getByRole("list", { name: "Pastas" }).getByRole("button");

    await expect(folders).toHaveText(["Fotos", "Projetos"]);
    await expect(folders.filter({ hasText: "Fotos" })).toBeDisabled();
    await expect(folders.filter({ hasText: "Projetos" })).toBeEnabled();
    await expect(dialog.getByText("relatorio.txt")).toHaveCount(0);
    await expect(dialog.getByText("Viagens")).toHaveCount(0);
  },
);

test(
  "o seletor percorre os níveis, carrega mais e aceita Meus arquivos como destino",
  { tag: "@LUI-181-CA10" },
  async ({ page }) => {
    const email = uniqueEmail();
    await signIn(page, email);
    const [a] = await seedFolderChain(email, ["A"]);
    const [b] = await seedFolderChain(email, ["B"], a);
    for (let index = 1; index <= 51; index++) {
      await seedFolder(email, `pasta-${String(index).padStart(3, "0")}`, b);
    }
    await seedFilesIn(email, a, [{ name: "arquivo.txt" }]);
    await page.goto(`/pasta/${a}`);

    const dialog = await openMove(page, "arquivo.txt");
    const path = dialog.getByRole("navigation", { name: "Caminho do destino" });
    const folders = dialog.getByRole("list", { name: "Pastas" }).getByRole("button", { name: /^(B|pasta-)/ });
    await expect(path).toHaveText("Meus arquivos");
    await dialog.getByRole("button", { name: "A", exact: true }).click();
    await expect(path).toHaveText("Meus arquivosA");
    await dialog.getByRole("button", { name: "B", exact: true }).click();

    await expect(path).toHaveText("Meus arquivosAB");
    await expect(folders).toHaveCount(50);
    await dialog.getByRole("button", { name: "Carregar mais" }).click();
    await expect(folders).toHaveCount(51);
    await expect(dialog.getByRole("button", { name: "Carregar mais" })).toHaveCount(0);

    await path.getByRole("button", { name: "Meus arquivos" }).click();
    await expect(path).toHaveText("Meus arquivos");
    await dialog.getByRole("button", { name: "Mover", exact: true }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("Movido para “Meus arquivos”.");
    await expect(rowOf(page, "arquivo.txt")).toHaveCount(0);
    await page.goto("/");
    await expect(rowOf(page, "arquivo.txt")).toHaveCount(1);
  },
);

test(
  "o diálogo de mover funciona pelo teclado",
  { tag: "@LUI-181-CA11" },
  async ({ page }) => {
    const email = uniqueEmail();
    await signIn(page, email);
    const alpha = await seedFolder(email, "Alfa");
    await seedFolder(email, "Beta", alpha);
    await seedRootFiles(email, [{ name: "relatorio.txt" }]);
    await page.reload();
    const trigger = rowOf(page, "relatorio.txt").getByRole("button", { name: "Mais ações" });
    const download = page.getByRole("menuitem", { name: "Baixar" });
    // Um Enter que chega antes da hidratação do menu se perde: o teclado tenta de novo até abrir.
    await expect(async () => {
      if ((await trigger.getAttribute("aria-expanded")) !== "true") {
        await trigger.press("Enter");
      }
      await expect(download).toBeFocused({ timeout: 1000 });
    }).toPass();

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Mover para…" })).toBeFocused();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Mover para…" });
    await expect(dialog.getByRole("button", { name: "Alfa" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("button", { name: "Beta" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Cancelar" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Mover", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("Movido para “Alfa”.");
    await expect(rowOf(page, "relatorio.txt")).toHaveCount(0);

    await openMove(page, "Alfa");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(rowOf(page, "Alfa")).toHaveCount(1);
  },
);

test(
  "no celular, o diálogo de mover ocupa a largura total",
  { tag: "@LUI-181-CA11" },
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    const email = uniqueEmail();
    await signIn(page, email);
    await seedRootFiles(email, [{ name: "relatorio.txt" }]);
    await page.reload();

    const dialog = await openMove(page, "relatorio.txt");

    const box = await dialog.boundingBox();
    expect(box?.width).toBeCloseTo(390 - 32, 0);
  },
);

test(
  "o diálogo mostra o erro de profundidade, sem fechar",
  { tag: "@LUI-181-CA12" },
  async ({ page }) => {
    const email = uniqueEmail();
    await signIn(page, email);
    const deep = await seedFolder(email, "Funda");
    await seedFolderChain(
      email,
      Array.from({ length: 49 }, (_, index) => `nivel-${index + 1}`),
      deep,
    );
    await seedFolder(email, "Destino");
    await page.reload();

    const dialog = await openMove(page, "Funda");
    await dialog.getByRole("button", { name: "Destino" }).click();
    await dialog.getByRole("button", { name: "Mover", exact: true }).click();

    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("alert")).toContainText("no máximo 50 níveis");
    await expect(rowOf(page, "Funda")).toHaveCount(1);
  },
);
