import { expect, test } from "@playwright/test";
import {
  accountMenuButton,
  createVerifiedUser,
  fillLogin,
  signIn,
} from "./support/account";
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
