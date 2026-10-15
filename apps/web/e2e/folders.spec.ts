import { expect, test, type Page } from "@playwright/test";
import { expectSignedInAs, signIn, signOut } from "./support/account";
import {
  seedFilesIn,
  seedFolder,
  seedFolderChain,
  seedRootFiles,
} from "./support/items";
import { uniqueEmail } from "./support/mailpit";
import { chooseFiles } from "./support/uploads";

/** As linhas da lista, sem a do cabeçalho. */
const rowsOf = (page: Page) =>
  page.getByRole("table").getByRole("row").filter({ has: page.getByRole("cell") });

/** O caminho da pasta, no topo da área de conteúdo. */
const breadcrumbOf = (page: Page) => page.getByRole("navigation", { name: "Caminho" });

test(
  "o Usuário abre pastas por duplo clique e volta pelo breadcrumb",
  { tag: "@LUI-179-CA7" },
  async ({ page }) => {
    const email = uniqueEmail();
    await signIn(page, email);
    const projects = await seedFolder(email, "Projetos");
    const year = await seedFolder(email, "2026", projects);
    await seedFilesIn(email, year, [{ name: "relatorio.txt" }]);
    await page.reload();

    await rowsOf(page).filter({ hasText: "Projetos" }).dblclick();
    await expect(page).toHaveURL(`/pasta/${projects}`);
    await rowsOf(page).filter({ hasText: "2026" }).dblclick();

    await expect(page).toHaveURL(`/pasta/${year}`);
    const trail = breadcrumbOf(page);
    await expect(trail.getByRole("link", { name: "Meus arquivos" })).toBeVisible();
    await expect(trail.getByRole("link", { name: "Projetos" })).toBeVisible();
    await expect(trail.getByRole("link", { name: "2026" })).toHaveCount(0);
    await expect(trail.getByRole("heading", { name: "2026", level: 1 })).toBeVisible();
    await expect(rowsOf(page)).toHaveCount(1);
    await expect(rowsOf(page).first()).toContainText("relatorio.txt");

    await page.reload();
    await expect(page).toHaveURL(`/pasta/${year}`);
    await expect(rowsOf(page).first()).toContainText("relatorio.txt");

    await trail.getByRole("link", { name: "Projetos" }).click();
    await expect(page).toHaveURL(`/pasta/${projects}`);
    await expect(rowsOf(page).filter({ hasText: "2026" })).toHaveCount(1);

    await page.goBack();
    await expect(page).toHaveURL(`/pasta/${year}`);
  },
);

test(
  "Nova pasta cria a pasta na pasta atual, avisa e fica nela",
  { tag: "@LUI-179-CA8" },
  async ({ page }) => {
    const email = uniqueEmail();
    await signIn(page, email);
    const folder = await seedFolder(email, "Projetos");
    await page.goto(`/pasta/${folder}`);

    await page.getByRole("button", { name: "Nova pasta" }).click();
    const dialog = page.getByRole("dialog", { name: "Nova pasta" });
    await dialog.getByLabel("Nome da pasta").fill("  Fotos  ");
    await dialog.getByRole("button", { name: "Criar" }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(`/pasta/${folder}`);
    await expect(rowsOf(page).filter({ hasText: "Fotos" })).toHaveCount(1);
    await expect(rowsOf(page).first().getByRole("cell").first()).toHaveText("Fotos", {
      useInnerText: true,
    });
    await expect(page.getByRole("status")).toContainText("Pasta “Fotos” criada.");
  },
);

test(
  "Nova pasta mostra o erro em português quando o nome é inválido ou a árvore está no limite",
  { tag: "@LUI-179-CA8" },
  async ({ page }) => {
    const email = uniqueEmail();
    await signIn(page, email);
    const dialog = page.getByRole("dialog", { name: "Nova pasta" });

    await page.getByRole("button", { name: "Nova pasta" }).click();
    await dialog.getByLabel("Nome da pasta").fill("   ");
    await dialog.getByRole("button", { name: "Criar" }).click();

    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Informe um nome para a pasta.")).toBeVisible();
    await expect(dialog.getByLabel("Nome da pasta")).toHaveValue("   ");
    await expect(page.getByRole("table")).toHaveCount(0);

    const chain = await seedFolderChain(
      email,
      Array.from({ length: 50 }, (_, index) => `nivel-${index + 1}`),
    );
    await page.goto(`/pasta/${chain[49]}`);
    await page.getByRole("button", { name: "Nova pasta" }).click();
    await dialog.getByLabel("Nome da pasta").fill("Fundo demais");
    await dialog.getByRole("button", { name: "Criar" }).click();

    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/no máximo 50 níveis/)).toBeVisible();
  },
);

test(
  "o endereço de uma pasta que não é do Usuário mostra a página de não encontrado",
  { tag: "@LUI-179-CA9" },
  async ({ page }) => {
    const other = uniqueEmail();
    await signIn(page, other);
    const othersFolder = await seedFolder(other, "Segredos");
    await signOut(page, other);
    await expect(page).toHaveURL(/\/entrar$/);
    const email = uniqueEmail();
    await signIn(page, email);
    const [fileId] = await seedRootFiles(email, [{ name: "arquivo.txt" }]);

    for (const id of [
      "01990000-0000-7000-8000-000000000000",
      othersFolder,
      fileId,
      "nao-e-uuid",
    ]) {
      await page.goto(`/pasta/${id}`);

      await expect(page.getByRole("heading", { name: "Pasta não encontrada" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Voltar para Meus arquivos" })).toBeVisible();
    }
    await page.getByRole("link", { name: "Voltar para Meus arquivos" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expectSignedInAs(page, email);
  },
);

test(
  "Carregar mais acrescenta a página seguinte de uma pasta longa",
  { tag: "@LUI-179-CA10" },
  async ({ page }) => {
    const email = uniqueEmail();
    await signIn(page, email);
    const folder = await seedFolder(email, "Cheia");
    await seedFilesIn(
      email,
      folder,
      Array.from({ length: 60 }, (_, index) => ({
        name: `item-${String(index + 1).padStart(3, "0")}.txt`,
      })),
    );
    const loadMore = page.getByRole("button", { name: "Carregar mais" });

    await page.goto(`/pasta/${folder}`);

    await expect(rowsOf(page)).toHaveCount(50);
    // O clique pode chegar antes da hidratação e se perder: repete até a página acrescentar.
    await expect(async () => {
      if (await loadMore.count()) await loadMore.click({ timeout: 1_000 });
      await expect(rowsOf(page)).toHaveCount(60, { timeout: 1_000 });
    }).toPass();
    await expect(loadMore).toHaveCount(0);
  },
);

test(
  "no celular o breadcrumb longo colapsa os trechos do meio num menu",
  { tag: "@LUI-179-CA10" },
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    const email = uniqueEmail();
    await signIn(page, email);
    const chain = await seedFolderChain(email, ["um", "dois", "tres", "quatro", "cinco"]);

    await page.goto(`/pasta/${chain[4]}`);

    const trail = breadcrumbOf(page);
    await expect(trail.getByRole("link", { name: "Meus arquivos" })).toBeVisible();
    await expect(trail.getByRole("link", { name: "um" })).toBeHidden();
    await expect(trail.getByRole("heading", { name: "cinco", level: 1 })).toBeVisible();
    await trail.getByRole("button", { name: "Pastas do caminho" }).click();
    const menu = page.getByRole("menu", { name: "Pastas do caminho" });
    await expect(menu.getByRole("menuitem")).toHaveText(["um", "dois", "tres", "quatro"]);
    await menu.getByRole("menuitem", { name: "dois" }).click();

    await expect(page).toHaveURL(`/pasta/${chain[1]}`);
    await expect(trail.getByRole("heading", { name: "dois", level: 1 })).toBeVisible();
  },
);

test(
  "os arquivos enviados com o botão Enviar vão para a pasta aberta",
  { tag: "@LUI-179-CA11" },
  async ({ page }) => {
    const email = uniqueEmail();
    await signIn(page, email);
    const folder = await seedFolder(email, "Destino");
    await page.goto(`/pasta/${folder}`);

    await chooseFiles(page, [
      { name: "na-pasta.txt", mimeType: "text/plain", buffer: Buffer.from("dentro") },
    ]);

    await expect(rowsOf(page).filter({ hasText: "na-pasta.txt" })).toHaveCount(1);
    await page.getByRole("link", { name: "Meus arquivos" }).first().click();
    await expect(page).toHaveURL(/\/$/);
    await expect(rowsOf(page).filter({ hasText: "Destino" })).toHaveCount(1);
    await expect(rowsOf(page).filter({ hasText: "na-pasta.txt" })).toHaveCount(0);

    await chooseFiles(page, [
      { name: "na-raiz.txt", mimeType: "text/plain", buffer: Buffer.from("fora") },
    ]);

    await expect(rowsOf(page).filter({ hasText: "na-raiz.txt" })).toHaveCount(1);
  },
);
