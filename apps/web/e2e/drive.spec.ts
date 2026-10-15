import { expect, test } from "@playwright/test";
import {
  accountMenuButton,
  createVerifiedUser,
  fillLogin,
  signIn,
} from "./support/account";
import { seedRootFiles } from "./support/items";
import { chooseFiles } from "./support/uploads";
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

test("depois de um envio, a lista volta à primeira página do servidor: \"Carregar mais\" aparece e nenhuma linha se repete", async ({
  page,
}) => {
  const email = uniqueEmail();
  await signIn(page, email);
  await seedRootFiles(
    email,
    Array.from({ length: 60 }, (_, index) => ({
      name: `relatorio-${String(index + 1).padStart(3, "0")}.txt`,
    })),
  );
  await page.reload();
  const files = page.getByRole("table", { name: "Meus arquivos" });
  const rows = files.getByRole("row").filter({ has: page.getByRole("cell") });
  const loadMore = page.getByRole("button", { name: "Carregar mais" });
  await expect(rows).toHaveCount(50);
  // O clique pode chegar antes da hidratação e se perder: repete até a página acrescentar.
  await expect(async () => {
    if (await loadMore.count()) await loadMore.click({ timeout: 1_000 });
    await expect(rows).toHaveCount(60, { timeout: 1_000 });
  }).toPass();
  await expect(loadMore).toHaveCount(0);

  // "a-novo.txt" ordena antes de todos, e empurra o último arquivo para a segunda página.
  await chooseFiles(page, [
    { name: "a-novo.txt", mimeType: "text/plain", buffer: Buffer.from("novo") },
  ]);

  await expect(rows.first()).toContainText("a-novo.txt");
  await expect(rows).toHaveCount(50);
  await expect(loadMore).toBeVisible();
  await loadMore.click();
  await expect(rows).toHaveCount(61);
  await expect(loadMore).toHaveCount(0);
  const names = await rows.evaluateAll((elements) =>
    elements.map((element) => /[\w-]+\.txt/.exec(element.textContent ?? "")?.[0]),
  );
  expect(new Set(names).size).toBe(61);
});

test("a gaveta aberta no celular se fecha quando a janela cresce para o desktop, e a página volta a responder", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await signIn(page, uniqueEmail());
  await page.getByRole("button", { name: "Abrir navegação" }).click();
  await expect(page.getByRole("dialog", { name: "Navegação" })).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 800 });

  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.getByRole("link", { name: "Meus arquivos" }).first().focus();
  await expect(page.getByRole("link", { name: "Meus arquivos" }).first()).toBeFocused();
  // O clique chega ao botão: com a página inerte, ele ficaria sem efeito.
  await page.getByRole("button", { name: "Enviar" }).click({ trial: true, timeout: 2000 });
});
