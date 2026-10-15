import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createVerifiedUser,
  expectSignedInAs,
  fillLogin,
  openVerificationLink,
  PASSWORD,
  signIn,
  signOut,
  signUp,
} from "./support/account";
import { uniqueEmail, waitForMailTo } from "./support/mailpit";
import {
  expectSessionExpiredNotice,
  expireAccessToken,
  plantSession,
  refreshTokenOf,
  SESSION_EXPIRED,
  TOKEN_COOKIES,
  tokenCookies,
  unsignedToken,
} from "./support/session";

/** O aviso do formulário fica acima do campo de e-mail. */
async function expectAboveEmailField(page: Page, alert: Locator) {
  const alertBox = await alert.boundingBox();
  const fieldBox = await page.getByLabel("E-mail").boundingBox();
  expect(alertBox!.y + alertBox!.height).toBeLessThan(fieldBox!.y);
}

test("abrir uma página protegida sem Sessão leva à tela de entrar e, depois do login, de volta à página pedida", async ({
  page,
}) => {
  const email = uniqueEmail();
  await createVerifiedUser(page, email);

  await page.goto("/?origem=teste");

  await expect(page).toHaveURL(/\/entrar\?destino=%2F%3Forigem%3Dteste$/);
  await fillLogin(page, email);

  await expect(page).toHaveURL(/\/\?origem=teste$/);
  await expectSignedInAs(page, email);
});

test("o campo do destino já está no formulário de entrar quando o botão aparece, e não chega depois", async ({
  page,
}) => {
  await page.goto("/entrar?destino=%2F%3Forigem%3Dteste", {
    waitUntil: "commit",
  });
  const form = page.locator("form", {
    has: page.getByRole("button", { name: "Entrar" }),
  });
  await expect(form).toBeVisible();

  // Lido na hora, sem esperar: um envio rápido leva o que está no formulário agora.
  const hidden = await form.evaluate(
    (element) =>
      (element.querySelector('input[name="destino"]') as HTMLInputElement | null)
        ?.value ?? null,
  );
  expect(hidden).toBe("/?origem=teste");
});

for (const destination of [
  "https://example.com/roubo",
  "//example.com/roubo",
  "/\\example.com/roubo",
]) {
  test(`o destino de retorno externo ${destination} é ignorado`, async ({
    page,
    baseURL,
  }) => {
    const email = uniqueEmail();
    await createVerifiedUser(page, email);

    await page.goto(`/entrar?destino=${encodeURIComponent(destination)}`);
    await fillLogin(page, email);

    await expectSignedInAs(page, email);
    expect(new URL(page.url()).origin).toBe(new URL(`${baseURL}`).origin);
    expect(new URL(page.url()).pathname).toBe("/");
  });
}

test("abrir a tela de entrar, ou a de criar conta, com Sessão leva ao produto", async ({
  page,
}) => {
  const email = uniqueEmail();
  await signIn(page, email);

  await page.goto("/entrar");
  await expect(page).toHaveURL(/\/$/);
  await expectSignedInAs(page, email);

  await page.goto("/criar-conta");
  await expect(page).toHaveURL(/\/$/);
});

test("os cookies de token são HttpOnly e não aparecem para o JavaScript da página", async ({
  page,
  context,
}) => {
  await signIn(page, uniqueEmail());

  const cookies = await tokenCookies(context);
  expect(cookies.map(({ name }) => name).sort()).toEqual(TOKEN_COOKIES);
  for (const cookie of cookies) {
    expect(cookie.httpOnly, `${cookie.name} é HttpOnly`).toBe(true);
    expect(cookie.sameSite, `${cookie.name} é SameSite=Lax`).toBe("Lax");
    expect(cookie.value).not.toBe("");
  }
  const visible = await page.evaluate(() => document.cookie);
  for (const name of TOKEN_COOKIES) {
    expect(visible).not.toContain(name);
  }
});

test("credenciais inválidas aparecem num aviso acima do formulário, igual para senha errada e e-mail sem Usuário", async ({
  page,
}) => {
  const email = uniqueEmail();
  await createVerifiedUser(page, email);

  await fillLogin(page, email, "uma senha bem errada");

  const alert = page.locator("form").getByRole("alert");
  await expect(alert).toHaveText("E-mail ou senha incorretos.");
  // O aviso vem antes dos campos, e o e-mail digitado continua no lugar.
  await expectAboveEmailField(page, alert);
  await expect(page.getByLabel("E-mail")).toHaveValue(email);
  await expect(page.getByLabel("Senha", { exact: true })).toHaveValue("");
  await expect(page).toHaveURL(/\/entrar/);

  await fillLogin(page, uniqueEmail(), PASSWORD);
  await expect(alert).toHaveText("E-mail ou senha incorretos.");
});

test("estourar o limite de tentativas de login mostra o aviso de espera acima do formulário, mesmo com a senha certa", async ({
  page,
}) => {
  const email = uniqueEmail();
  await createVerifiedUser(page, email);
  const alert = page.locator("form").getByRole("alert");
  // O teto de produção: cinco tentativas por e-mail a cada 15 minutos.
  for (let attempt = 1; attempt <= 5; attempt++) {
    await fillLogin(page, email, "uma senha bem errada");
    await expect(alert).toHaveText("E-mail ou senha incorretos.");
    // O botão volta a aceitar o clique quando o envio anterior termina.
    await expect(page.getByRole("button", { name: "Entrar" })).toBeEnabled();
  }

  await fillLogin(page, email, PASSWORD);

  await expect(alert).toHaveText(
    "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
  );
  await expectAboveEmailField(page, alert);
  await expect(page.getByLabel("E-mail")).toHaveValue(email);
  await expect(page).toHaveURL(/\/entrar/);
});

test("o Usuário não verificado vê o aviso e pede o reenvio na própria tela de entrar", async ({
  page,
}) => {
  const email = uniqueEmail();
  await signUp(page, email);
  await waitForMailTo(email);

  await page.goto("/entrar");
  await fillLogin(page, email);

  await expect(page.locator("form").getByRole("alert")).toContainText(
    "Seu e-mail ainda não foi verificado. Confira sua caixa de entrada.",
  );
  // O reenvio vale para o e-mail recusado, mesmo que o campo mude depois.
  await page.getByLabel("E-mail").fill("outro@example.com");
  await page.getByRole("button", { name: "Reenviar e-mail" }).click();

  await expect(page.getByRole("status")).toHaveText(
    "Enviamos um novo link. Confira sua caixa de entrada.",
  );
  await expect(page).toHaveURL(/\/entrar$/);

  await openVerificationLink(page, email, 2);
  await fillLogin(page, email);
  await expectSignedInAs(page, email);
});

test("com o aviso de e-mail não verificado na tela, a tecla Enter entra, e não reenvia", async ({
  page,
  context,
}) => {
  const email = uniqueEmail();
  await signUp(page, email);
  await page.goto("/entrar");
  await fillLogin(page, email);
  await expect(page.locator("form").getByRole("alert")).toBeVisible();

  // A pessoa verifica o e-mail em outra aba e volta para digitar a senha.
  await openVerificationLink(await context.newPage(), email);
  const password = page.getByLabel("Senha", { exact: true });
  await password.fill(PASSWORD);
  await password.press("Enter");

  await expectSignedInAs(page, email);
  await expect(page).toHaveURL(/\/$/);
});

test("os erros de preenchimento do login aparecem junto ao campo, em português", async ({
  page,
}) => {
  await page.goto("/entrar");
  const email = page.getByLabel("E-mail");
  await email.fill("nome@exemplo");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(email).toHaveAccessibleDescription(
    "Informe um e-mail válido, como nome@exemplo.com.",
  );
  await expect(
    page.getByLabel("Senha", { exact: true }),
  ).toHaveAccessibleDescription("Informe sua senha.");
  await expect(email).toHaveValue("nome@exemplo");
});

test("a tela de entrar leva ao cadastro", async ({ page }) => {
  await page.goto("/entrar");
  await expect(
    page.getByRole("link", { name: "Esqueci minha senha" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Criar conta" }).click();

  await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();
});

test("a tela de entrar leva à de \"Esqueci minha senha\"", async ({
  page,
}) => {
  await page.goto("/entrar");

  await page.getByRole("link", { name: "Esqueci minha senha" }).click();

  await expect(page).toHaveURL(/\/esqueci-minha-senha$/);
  await expect(
    page.getByRole("heading", { name: "Esqueci minha senha" }),
  ).toBeVisible();
});

test("uma rota com ponto no nome também passa pelo Proxy", async ({ page }) => {
  await page.goto("/arquivos/relatorio.pdf");

  await expect(page).toHaveURL(
    /\/entrar\?destino=%2Farquivos%2Frelatorio\.pdf$/,
  );
});

test("com o token de acesso expirado e o de renovação válido, a navegação segue sem passar pela tela de entrar", async ({
  page,
  context,
}) => {
  const email = uniqueEmail();
  await signIn(page, email);
  const previous = await refreshTokenOf(context);
  await expireAccessToken(context);

  await page.goto("/?origem=teste");

  await expect(page).toHaveURL(/\/\?origem=teste$/);
  await expectSignedInAs(page, email);
  // A renovação trocou o par: os dois cookies voltaram, e o de renovação é outro.
  const cookies = await tokenCookies(context);
  expect(cookies.map(({ name }) => name).sort()).toEqual(TOKEN_COOKIES);
  expect(await refreshTokenOf(context)).not.toBe(previous);
  for (const cookie of cookies) {
    expect(cookie.httpOnly, `${cookie.name} é HttpOnly`).toBe(true);
  }
});

test("um token de acesso expirado que ainda está no cookie também é renovado", async ({
  page,
  context,
}) => {
  const email = uniqueEmail();
  await signIn(page, email);
  await plantSession(context, {
    accessToken: unsignedToken(-60),
    refreshToken: await refreshTokenOf(context),
  });

  await page.goto("/");

  await expect(page).toHaveURL(/\/$/);
  await expectSignedInAs(page, email);
});

test("abrir a tela de entrar com o token de acesso expirado e a Sessão válida leva ao produto", async ({
  page,
  context,
}) => {
  const email = uniqueEmail();
  await signIn(page, email);
  await expireAccessToken(context);

  await page.goto("/entrar");

  await expect(page).toHaveURL(/\/$/);
  await expectSignedInAs(page, email);
});

test("duas abas navegando ao mesmo tempo com o token de acesso expirado continuam com Sessão", async ({
  page,
  context,
}) => {
  const email = uniqueEmail();
  await signIn(page, email);
  const otherTab = await context.newPage();
  await expireAccessToken(context);

  await Promise.all([page.goto("/?aba=1"), otherTab.goto("/?aba=2")]);

  await expect(page).toHaveURL(/\/\?aba=1$/);
  await expect(otherTab).toHaveURL(/\/\?aba=2$/);
  await expectSignedInAs(page, email);
  await expectSignedInAs(otherTab, email);
  // O cookie que ficou, de qualquer uma das duas renovações, ainda renova.
  await expireAccessToken(context);
  await page.goto("/?aba=1");
  await expect(page).toHaveURL(/\/\?aba=1$/);
  await expectSignedInAs(page, email);
});

test("com a Sessão revogada, os cookies são apagados e a tela de entrar mostra o aviso de sessão expirada", async ({
  page,
  context,
}) => {
  const email = uniqueEmail();
  await signIn(page, email);
  const revoked = await refreshTokenOf(context);
  // Sair encerra a Sessão na API. O navegador volta a ter o token dela, como outro aparelho teria.
  await signOut(page, email);
  await expect(page).toHaveURL(/\/entrar$/);
  await plantSession(context, { refreshToken: revoked });

  await page.goto("/?origem=teste");

  await expect(page).toHaveURL(
    /\/entrar\?aviso=sessao-expirada&destino=%2F%3Forigem%3Dteste$/,
  );
  await expect(page.getByRole("status")).toHaveText(SESSION_EXPIRED);
  expect(await tokenCookies(context)).toEqual([]);

  // O aviso não atrapalha a volta ao destino.
  await fillLogin(page, email);
  await expect(page).toHaveURL(/\/\?origem=teste$/);
  await expectSignedInAs(page, email);
});

test("sair com o token de acesso expirado encerra a Sessão na API e apaga os cookies", async ({
  page,
  context,
}) => {
  const email = uniqueEmail();
  await signIn(page, email);
  const beforeLogout = await refreshTokenOf(context);
  await expireAccessToken(context);

  await signOut(page, email);

  await expect(page).toHaveURL(/\/entrar$/);
  expect(await tokenCookies(context)).toEqual([]);
  // A Sessão acabou na API, e não só neste navegador: o token dela não renova mais.
  await plantSession(context, { refreshToken: beforeLogout });
  await page.goto("/");
  await expectSessionExpiredNotice(page);
});

test("sair com a Sessão já revogada leva à tela de entrar e apaga os cookies", async ({
  page,
  context,
}) => {
  const email = uniqueEmail();
  await signIn(page, email);
  const otherTab = await context.newPage();
  await otherTab.goto("/");
  const revoked = await refreshTokenOf(context);
  await signOut(otherTab, email);
  await expect(otherTab).toHaveURL(/\/entrar$/);
  // A primeira aba continua na página do produto, com os cookies de uma Sessão que acabou.
  await plantSession(context, { refreshToken: revoked });

  await signOut(page, email);

  await expect(page).toHaveURL(/\/entrar/);
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  expect(await tokenCookies(context)).toEqual([]);
});

test("um token de renovação que a API não conhece leva à tela de entrar com o aviso e apaga os cookies", async ({
  page,
  context,
}) => {
  await plantSession(context, { accessToken: unsignedToken(-60) });

  await page.goto("/");

  await expectSessionExpiredNotice(page);
  expect(await tokenCookies(context)).toEqual([]);
});

test("um token que só parece válido não passa da camada de acesso a dados", async ({
  page,
  context,
}) => {
  // O Proxy vê uma expiração futura e deixa passar. Quem barra é a API, pela assinatura.
  await plantSession(context, { accessToken: unsignedToken(600) });

  await page.goto("/");

  await expectSessionExpiredNotice(page);
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  expect(await tokenCookies(context)).toEqual([]);
});

test("a rota que encerra a Sessão renova, em vez de deslogar, quem só está com o token de acesso expirado", async ({
  page,
  context,
}) => {
  const email = uniqueEmail();
  await signIn(page, email);
  await expireAccessToken(context);

  await page.goto("/sessao-encerrada");

  await expect(page).toHaveURL(/\/$/);
  await expectSignedInAs(page, email);
});

test("um token de acesso que a API recusa é trocado pela renovação, sem derrubar a Sessão", async ({
  page,
  context,
}) => {
  const email = uniqueEmail();
  await signIn(page, email);
  // O Proxy vê uma expiração futura e não renova. Quem recusa o token é a API.
  await plantSession(context, {
    accessToken: unsignedToken(600),
    refreshToken: await refreshTokenOf(context),
  });

  await page.goto("/");

  await expect(page).toHaveURL(/\/$/);
  await expectSignedInAs(page, email);
});

test("a rota que encerra a Sessão não desloga quem tem uma Sessão boa", async ({
  page,
}) => {
  const email = uniqueEmail();
  await signIn(page, email);

  await page.goto("/sessao-encerrada");

  await expect(page).toHaveURL(/\/$/);
  await expectSignedInAs(page, email);
});
