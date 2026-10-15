import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/account";
import { uniqueEmail } from "./support/mailpit";
import { fillQuota } from "./support/quota";
import { chooseFiles, panelOf } from "./support/uploads";

const CONTENT = "conteudo do relatorio";

/** Clica em "Enviar" e escolhe `relatorio.txt` no seletor, como a pessoa faz. */
const sendReport = (page: Page) =>
  chooseFiles(page, [
    { name: "relatorio.txt", mimeType: "text/plain", buffer: Buffer.from(CONTENT) },
  ]);

test("o Usuário envia um arquivo pelo botão Enviar, vê o envio no painel e o arquivo na lista sem recarregar @LUI-167-CA12", async ({
  page,
}) => {
  await signIn(page, uniqueEmail());
  await expect(page.getByText("Nenhum arquivo ainda")).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { marker: string }).marker = "mesma-pagina";
  });

  await sendReport(page);

  const panel = panelOf(page);
  await expect(panel.getByText("relatorio.txt")).toBeVisible();
  await expect(panel.getByRole("img", { name: "Concluído" })).toBeVisible();
  const row = page.getByRole("row", { name: /relatorio\.txt/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText(`${CONTENT.length} B`);
  await expect(page.getByText("Nenhum arquivo ainda")).toBeHidden();
  expect(
    await page.evaluate(() => (window as unknown as { marker?: string }).marker),
  ).toBe("mesma-pagina");
});

test("um envio sem espaço na Cota aparece no painel como erro daquele arquivo @LUI-167-CA13", async ({
  page,
}) => {
  const email = uniqueEmail();
  await signIn(page, email);
  await fillQuota(email);

  await sendReport(page);

  const panel = panelOf(page);
  await expect(panel.getByText("relatorio.txt")).toBeVisible();
  await expect(
    panel.getByText("Não há espaço na sua cota para este arquivo"),
  ).toBeVisible();
  await expect(page.getByText("Nenhum arquivo ainda")).toBeVisible();
  // O anúncio de rota do Next.js também é um `alert`, mas fica fora da área de conteúdo.
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByText("Não há espaço na sua cota para este arquivo"),
  ).toHaveCount(1);
});
