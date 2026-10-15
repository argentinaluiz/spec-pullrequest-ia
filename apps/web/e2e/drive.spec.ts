import { expect, test } from "@playwright/test";
import {
  accountMenuButton,
  createVerifiedUser,
  fillLogin,
  signIn,
} from "./support/account";
import { seedRootFiles } from "./support/items";
import { uniqueEmail } from "./support/mailpit";
import {
  expectSessionExpiredNotice,
  plantSession,
  refreshTokenOf,
  tokenCookies,
} from "./support/session";

test("depois de entrar, o Usuário vê \"Meus arquivos\" na casca do Drive @LUI-166-CA6", async ({
  page,
}) => {
  const email = uniqueEmail();
  await createVerifiedUser(page, email);

  await fillLogin(page, email);

  await expect(page).toHaveURL(/\/$/);
  const banner = page.getByRole("banner");
  await expect(banner.getByText("Gerenciador de arquivos")).toBeVisible();
  await expect(accountMenuButton(page, email)).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Navegação principal" });
  await expect(
    navigation.getByRole("link", { name: "Meus arquivos" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("main").getByRole("heading", { level: 1 }),
  ).toHaveText("Meus arquivos");
});

test("sair pelo menu da conta encerra a Sessão e leva à tela de entrar @LUI-166-CA9", async ({
  page,
  context,
}) => {
  const email = uniqueEmail();
  await signIn(page, email);
  const beforeLogout = await refreshTokenOf(context);

  await accountMenuButton(page, email).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();

  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  expect(await tokenCookies(context)).toEqual([]);
  // A Sessão acabou na API, e não só neste navegador: o token dela não renova mais.
  await plantSession(context, { refreshToken: beforeLogout });
  await page.goto("/");
  await expectSessionExpiredNotice(page);
});

test("a Pasta raiz vazia mostra o estado vazio com o convite para enviar arquivos @LUI-166-CA7", async ({
  page,
}) => {
  const email = uniqueEmail();
  await createVerifiedUser(page, email);

  await fillLogin(page, email);

  const main = page.getByRole("main");
  await expect(
    main.getByRole("heading", { name: "Nenhum arquivo ainda" }),
  ).toBeVisible();
  await expect(
    main.getByText("Arraste arquivos para cá ou clique em Enviar."),
  ).toBeVisible();
  await expect(main.getByRole("table")).toHaveCount(0);
});

test("a lista mostra nome, tipo, tamanho e data, e \"Carregar mais\" acrescenta a página seguinte até o fim @LUI-166-CA8", async ({
  page,
}) => {
  const email = uniqueEmail();
  await signIn(page, email);
  await seedRootFiles(email, [
    {
      name: "Contrato de locação.pdf",
      mimeType: "application/pdf",
      // 2,4 MiB.
      sizeBytes: 2_516_582,
      // Ainda é dia 12 em São Paulo, e já é dia 13 em UTC.
      updatedAt: new Date("2026-10-13T01:30:00.000Z"),
    },
    ...Array.from({ length: 50 }, (_, index) => ({
      name: `relatorio-${String(index + 1).padStart(3, "0")}.txt`,
    })),
  ]);
  const files = page.getByRole("table", { name: "Meus arquivos" });
  const rows = files.getByRole("row").filter({ has: page.getByRole("cell") });
  const loadMore = page.getByRole("button", { name: "Carregar mais" });

  await page.reload();

  await expect(rows).toHaveCount(50);
  // O texto que está na tela: a segunda linha sob o nome só aparece no celular.
  await expect(rows.first().getByRole("cell")).toHaveText(
    // A última célula é a do botão "Mais ações", que só tem ícone.
    ["Contrato de locação.pdf", "PDF", "2,4 MB", "12 out. 2026", ""],
    { useInnerText: true },
  );
  await expect(rows.last()).toContainText("relatorio-049.txt");
  const url = page.url();

  await loadMore.click();

  await expect(rows).toHaveCount(51);
  await expect(rows.last()).toContainText("relatorio-050.txt");
  await expect(rows.first()).toContainText("Contrato de locação.pdf");
  await expect(rows.nth(49)).toContainText("relatorio-049.txt");
  expect(page.url()).toBe(url);
  await expect(loadMore).toHaveCount(0);
});
