import { expect, type Page } from "@playwright/test";
import { extractLink, waitForMailTo } from "./mailpit";

export const PASSWORD = "uma senha bem longa";

/** Preenche e envia o formulário de cadastro. */
export async function signUp(page: Page, email: string, password = PASSWORD) {
  await page.goto("/criar-conta");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(
    page.getByRole("heading", { name: "Confira seu e-mail" }),
  ).toBeVisible();
}

/**
 * Abre o link do e-mail mais novo para o caminho `path`, depois de o endereço ter recebido
 * `count` e-mails.
 */
export async function openMailLink(
  page: Page,
  email: string,
  path: string,
  count: number,
) {
  const link = extractLink(await waitForMailTo(email, { count }), path);
  await page.goto(link.pathname + link.search);
  return link;
}

/** Abre o link de verificação do e-mail mais novo, depois de o endereço ter recebido `count`. */
export function openVerificationLink(page: Page, email: string, count = 1) {
  return openMailLink(page, email, "/verificar-email", count);
}

/** Deixa o e-mail com um Usuário verificado, pelo mesmo caminho que a pessoa faz. */
export async function createVerifiedUser(page: Page, email: string) {
  await signUp(page, email);
  await openVerificationLink(page, email);
  await expect(page).toHaveURL(/\/entrar/);
}

/** Preenche e envia o formulário de entrar, na tela em que a página já está. */
export async function fillLogin(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

/** O botão do menu da conta, na barra superior do Drive. O nome dele traz o e-mail do Usuário. */
export function accountMenuButton(page: Page, email: string) {
  return page.getByRole("button", { name: `Conta de ${email}` });
}

/** A página é a do Drive, com a Sessão do Usuário do e-mail. */
export async function expectSignedInAs(page: Page, email: string) {
  await expect(accountMenuButton(page, email)).toBeVisible();
}

/** Cria um Usuário verificado e entra com ele. Termina na casca do Drive, em "Meus arquivos". */
export async function signIn(page: Page, email: string) {
  await createVerifiedUser(page, email);
  await fillLogin(page, email);
  await expectSignedInAs(page, email);
}

/** Sai pelo menu da conta, na página do Drive em que a página já está. */
export async function signOut(page: Page, email: string) {
  await accountMenuButton(page, email).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
}
