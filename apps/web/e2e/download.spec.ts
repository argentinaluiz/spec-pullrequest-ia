import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { signIn } from "./support/account";
import { uniqueEmail } from "./support/mailpit";
import { accessTokenOf } from "./support/session";
import { completeUpload, createUpload } from "./support/storage";

/**
 * Deixa na lista um arquivo ativo de nome e conteúdo conhecidos: cria o envio pela API, manda os
 * bytes por um `PUT` da própria página (a origem que o emulador aceita), conclui e recarrega.
 */
async function seedFile(
  page: Page,
  context: BrowserContext,
  name: string,
  content: string,
): Promise<string> {
  const accessToken = await accessTokenOf(context);
  const { itemId, uploadUrl } = await createUpload(accessToken, {
    name,
    sizeBytes: Buffer.byteLength(content),
    mimeType: "text/plain",
  });
  const status = await page.evaluate(
    async ({ url, body }) => (await fetch(url, { method: "PUT", body })).status,
    { url: uploadUrl, body: content },
  );
  expect(status).toBe(200);
  expect((await completeUpload(accessToken, itemId)).status).toBe(200);
  await page.reload();
  return itemId;
}

test("o Usuário baixa um arquivo pelo Baixar do menu da linha e recebe o conteúdo com o nome original", { tag: "@LUI-168-CA4" }, async ({
  page,
  context,
}) => {
  const content = "conteudo do relatorio do mes";
  await signIn(page, uniqueEmail());
  await seedFile(page, context, "relatório do mês.txt", content);
  const row = page.getByRole("row", { name: /relatório do mês\.txt/ });

  await row.getByRole("button", { name: "Mais ações" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Baixar" }).click(),
  ]);
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) {
    chunks.push(chunk as Buffer);
  }

  expect(download.suggestedFilename()).toBe("relatório do mês.txt");
  expect(Buffer.concat(chunks).toString()).toBe(content);
  // Relativo, o endereço é resolvido contra a web do projeto (playwright.config.ts).
  await expect(page).toHaveURL("/");
  await expect(row).toBeVisible();
});

test("o Baixar do menu da linha também ativa com Espaço, como os itens que são botões", async ({
  page,
  context,
}) => {
  await signIn(page, uniqueEmail());
  await seedFile(page, context, "notas.txt", "notas");
  const row = page.getByRole("row", { name: /notas\.txt/ });
  const trigger = row.getByRole("button", { name: "Mais ações" });
  const link = page.getByRole("menuitem", { name: "Baixar" });
  // Um Enter que chega antes da hidratação do menu se perde: o teclado tenta de novo até abrir.
  await expect(async () => {
    if ((await trigger.getAttribute("aria-expanded")) !== "true") {
      await trigger.press("Enter");
    }
    await expect(link).toBeFocused({ timeout: 1000 });
  }).toPass();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.keyboard.press("Space"),
  ]);

  expect(download.suggestedFilename()).toBe("notas.txt");
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("o HTML da lista não traz URL assinada do storage, só o caminho da web", { tag: "@LUI-168-CA5" }, async ({
  page,
  context,
}) => {
  await signIn(page, uniqueEmail());
  const itemId = await seedFile(page, context, "relatorio.txt", "ola!!");
  const forbidden = ["localhost:4443", "X-Goog-Signature", "response-content-disposition"];

  const served = await context.request.get("/");
  const servedHtml = await served.text();
  await page
    .getByRole("row", { name: /relatorio\.txt/ })
    .getByRole("button", { name: "Mais ações" })
    .click();
  const link = page.getByRole("menuitem", { name: "Baixar" });
  await expect(link).toBeVisible();
  const openHtml = await page.content();

  expect(servedHtml).toContain("relatorio.txt");
  for (const text of forbidden) {
    expect(servedHtml).not.toContain(text);
    expect(openHtml).not.toContain(text);
  }
  await expect(link).toHaveAttribute("href", `/arquivos/${itemId}/baixar`);
});

test("com Sessão, um arquivo que não baixa responde 404 com uma frase, e não uma página em branco", async ({
  page,
}) => {
  await signIn(page, uniqueEmail());

  const response = await page.goto(`/arquivos/${randomUUID()}/baixar`);

  expect(response?.status()).toBe(404);
  expect(response?.headers()["content-type"]).toBe("text/plain; charset=utf-8");
  await expect(page.locator("body")).toHaveText("Arquivo não encontrado.");
});

test("sem Sessão, a rota de download leva à tela de entrar", { tag: "@LUI-168-CA6" }, async ({
  page,
}) => {
  const path = `/arquivos/${randomUUID()}/baixar`;
  let downloaded = false;
  page.on("download", () => {
    downloaded = true;
  });

  await page.goto(path);

  const url = new URL(page.url());
  expect(url.pathname).toBe("/entrar");
  expect(url.search).toContain(`destino=${encodeURIComponent(path)}`);
  expect(downloaded).toBe(false);
});
