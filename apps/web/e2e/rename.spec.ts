import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/account";
import { seedFolder, seedRootFiles } from "./support/items";
import { uniqueEmail } from "./support/mailpit";

/** As linhas da lista, sem a do cabeçalho. */
const rowsOf = (page: Page) =>
  page.getByRole("table").getByRole("row").filter({ has: page.getByRole("cell") });

/** A linha do item de nome `name`. */
const rowOf = (page: Page, name: string) => rowsOf(page).filter({ hasText: name });

/** Abre o diálogo de renomear a partir do menu "Mais ações" da linha. */
async function openRename(page: Page, name: string) {
  await rowOf(page, name).getByRole("button", { name: "Mais ações" }).click();
  await page.getByRole("menuitem", { name: "Renomear" }).click();
  return page.getByRole("dialog", { name: "Renomear" });
}

const LONG_AGO = new Date("2020-01-01T12:00:00Z");

test(
  "o Usuário renomeia um arquivo pelo diálogo, que abre com o nome selecionado",
  { tag: "@LUI-180-CA6" },
  async ({ page }) => {
    const email = uniqueEmail();
    await signIn(page, email);
    await seedRootFiles(email, [{ name: "relatorio.txt", updatedAt: LONG_AGO }]);
    await page.reload();
    await expect(rowOf(page, "relatorio.txt")).toContainText("2020");

    const dialog = await openRename(page, "relatorio.txt");
    const field = dialog.getByLabel("Nome");

    await expect(field).toHaveValue("relatorio.txt");
    await expect(field).toBeFocused();
    expect(
      await field.evaluate((input: HTMLInputElement) => [
        input.selectionStart,
        input.selectionEnd,
        input.value.length,
      ]),
    ).toEqual([0, "relatorio.txt".length, "relatorio.txt".length]);

    await field.fill("  balanco.txt  ");
    await dialog.getByRole("button", { name: "Renomear" }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("Renomeado para “balanco.txt”.");
    await expect(rowOf(page, "balanco.txt")).toHaveCount(1);
    await expect(rowOf(page, "balanco.txt")).not.toContainText("2020");
    await expect(rowOf(page, "balanco.txt")).toContainText(String(new Date().getFullYear()));
    await expect(rowOf(page, "relatorio.txt")).toHaveCount(0);
  },
);

test(
  "o Usuário renomeia uma pasta pelo menu da linha",
  { tag: "@LUI-180-CA6" },
  async ({ page }) => {
    const email = uniqueEmail();
    await signIn(page, email);
    await seedFolder(email, "Fotos");
    await page.reload();

    const dialog = await openRename(page, "Fotos");
    await expect(dialog.getByLabel("Nome")).toHaveValue("Fotos");
    await dialog.getByLabel("Nome").fill("Viagens");
    await dialog.getByRole("button", { name: "Renomear" }).click();

    await expect(dialog).toHaveCount(0);
    await expect(rowOf(page, "Viagens")).toHaveCount(1);
    await expect(rowOf(page, "Fotos")).toHaveCount(0);
  },
);

test(
  "o diálogo mostra o erro do nome inválido, sem fechar",
  { tag: "@LUI-180-CA7" },
  async ({ page }) => {
    const email = uniqueEmail();
    await signIn(page, email);
    await seedRootFiles(email, [{ name: "relatorio.txt" }]);
    await page.reload();
    const dialog = await openRename(page, "relatorio.txt");

    await dialog.getByLabel("Nome").fill("   ");
    await dialog.getByRole("button", { name: "Renomear" }).click();

    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Informe um nome.")).toBeVisible();

    await dialog.getByLabel("Nome").fill("a/b");
    await dialog.getByRole("button", { name: "Renomear" }).click();

    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/não pode ter “\/”/)).toBeVisible();
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(rowOf(page, "relatorio.txt")).toHaveCount(1);
  },
);

test(
  "os menus da pasta e do arquivo não têm Excluir",
  { tag: "@LUI-180-CA8" },
  async ({ page }) => {
    const email = uniqueEmail();
    await signIn(page, email);
    await seedFolder(email, "Fotos");
    await seedRootFiles(email, [{ name: "relatorio.txt" }]);
    await page.reload();

    await rowOf(page, "Fotos").getByRole("button", { name: "Mais ações" }).click();
    await expect(page.getByRole("menuitem")).toHaveText(["Renomear"]);
    await page.keyboard.press("Escape");

    await rowOf(page, "relatorio.txt").getByRole("button", { name: "Mais ações" }).click();
    await expect(page.getByRole("menuitem")).toHaveText(["Baixar", "Renomear"]);
    await expect(page.getByRole("menuitem", { name: "Excluir" })).toHaveCount(0);
  },
);

test(
  "o diálogo de renomear abre, confirma e fecha pelo teclado",
  { tag: "@LUI-180-CA9" },
  async ({ page }) => {
    const email = uniqueEmail();
    await signIn(page, email);
    await seedRootFiles(email, [{ name: "relatorio.txt" }]);
    await page.reload();
    const trigger = rowOf(page, "relatorio.txt").getByRole("button", { name: "Mais ações" });
    const menuItem = page.getByRole("menuitem", { name: "Baixar" });
    // Um Enter que chega antes da hidratação do menu se perde: o teclado tenta de novo até abrir.
    await expect(async () => {
      if ((await trigger.getAttribute("aria-expanded")) !== "true") {
        await trigger.press("Enter");
      }
      await expect(menuItem).toBeFocused({ timeout: 1000 });
    }).toPass();

    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Renomear" })).toBeFocused();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Renomear" });
    await expect(dialog.getByLabel("Nome")).toBeFocused();
    await page.keyboard.type("balanco.txt");
    await page.keyboard.press("Enter");

    await expect(dialog).toHaveCount(0);
    await expect(rowOf(page, "balanco.txt")).toHaveCount(1);

    await openRename(page, "balanco.txt");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(rowOf(page, "balanco.txt")).toHaveCount(1);
  },
);

test(
  "renomear um item de uma página carregada por Carregar mais não deixa o nome antigo na lista",
  async ({ page }) => {
    const email = uniqueEmail();
    await signIn(page, email);
    await seedRootFiles(
      email,
      Array.from({ length: 51 }, (_, index) => ({
        name: `arquivo-${String(index + 1).padStart(3, "0")}.txt`,
      })),
    );
    await page.reload();
    await page.getByRole("button", { name: "Carregar mais" }).click();
    await expect(rowOf(page, "arquivo-051.txt")).toHaveCount(1);

    const dialog = await openRename(page, "arquivo-051.txt");
    // O novo nome continua depois da primeira página: o servidor devolve os mesmos 50 itens, e
    // só o descarte das páginas acrescentadas tira o nome antigo da tela.
    await dialog.getByLabel("Nome").fill("zzz-ultimo.txt");
    await dialog.getByRole("button", { name: "Renomear" }).click();

    await expect(dialog).toHaveCount(0);
    await expect(rowOf(page, "arquivo-051.txt")).toHaveCount(0);
    await page.getByRole("button", { name: "Carregar mais" }).click();
    await expect(rowOf(page, "zzz-ultimo.txt")).toHaveCount(1);
    await expect(rowOf(page, "arquivo-051.txt")).toHaveCount(0);
  },
);
