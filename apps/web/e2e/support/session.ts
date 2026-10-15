import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/* Os cookies de token da Sessão, como o navegador os guarda (docs/lld.md, seção 7.2). */

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";
export const TOKEN_COOKIES = [ACCESS_COOKIE, REFRESH_COOKIE];

/** Um JWT que ninguém assinou, com a expiração pedida. A web não confere a assinatura. */
export function unsignedToken(expiresInSeconds: number): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return [
    encode({ alg: "RS256", typ: "JWT" }),
    encode({
      sub: "0198a3f0-0000-7000-8000-000000000000",
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    }),
    "assinatura-que-nao-confere",
  ].join(".");
}

export const SESSION_EXPIRED = "Sua sessão expirou. Entre de novo para continuar.";

/** Põe no navegador os cookies de uma Sessão. Sem o token de renovação, vai um que a API nunca emitiu. */
export async function plantSession(
  context: BrowserContext,
  tokens: { accessToken?: string; refreshToken?: string },
) {
  // A web do projeto do teste, que é onde o navegador manda o cookie.
  const url = test.info().project.use.baseURL;
  if (!url) throw new Error("O projeto do teste não define o baseURL da web.");
  const { accessToken, refreshToken = "token-que-nunca-existiu" } = tokens;
  await context.addCookies([
    ...(accessToken
      ? [{ name: ACCESS_COOKIE, value: accessToken, url, httpOnly: true }]
      : []),
    { name: REFRESH_COOKIE, value: refreshToken, url, httpOnly: true },
  ]);
}

/**
 * Deixa o navegador como ele fica quando o token de acesso expira: o cookie dele dura o mesmo
 * que o token e some, e o do token de renovação continua.
 */
export async function expireAccessToken(context: BrowserContext) {
  await context.clearCookies({ name: ACCESS_COOKIE });
}

/** A tela de entrar, com o aviso de que a Sessão acabou e sem mais nada na URL. */
export async function expectSessionExpiredNotice(page: Page) {
  await expect(page).toHaveURL(/\/entrar\?aviso=sessao-expirada$/);
  await expect(page.getByRole("status")).toHaveText(SESSION_EXPIRED);
}

export async function refreshTokenOf(context: BrowserContext): Promise<string> {
  const cookie = (await context.cookies()).find(
    ({ name }) => name === REFRESH_COOKIE,
  );
  if (!cookie) throw new Error("O navegador não tem o cookie de renovação.");
  return cookie.value;
}

export async function tokenCookies(context: BrowserContext) {
  return (await context.cookies()).filter(({ name }) =>
    TOKEN_COOKIES.includes(name),
  );
}

/** O token de acesso da Sessão, como o navegador o guarda. Serve às chamadas diretas à API. */
export async function accessTokenOf(context: BrowserContext): Promise<string> {
  const cookie = (await context.cookies()).find(
    ({ name }) => name === ACCESS_COOKIE,
  );
  if (!cookie) throw new Error("O navegador não tem o cookie do token de acesso.");
  return cookie.value;
}
