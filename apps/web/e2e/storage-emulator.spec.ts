import { expect, test } from "@playwright/test";
import { signIn } from "./support/account";
import { uniqueEmail } from "./support/mailpit";
import { accessTokenOf } from "./support/session";
import { completeUpload, createUpload, downloadUrlOf } from "./support/storage";

const CHUNK = 256 * 1024;

test.describe("Emulador de storage", () => {
  let email: string;

  test.beforeEach(async ({ page }) => {
    email = uniqueEmail();
    // O PUT parte de uma página da web, que é a origem de onde o upload vai sair. A Sessão
    // serve para criar o envio pela API, como a tela faz.
    await signIn(page, email);
  });

  test("envia o arquivo em 2 chunks, com 308 no primeiro e 200 no segundo", { tag: "@LUI-165-CA5" }, async ({
    page,
    context,
  }) => {
    const accessToken = await accessTokenOf(context);
    const { itemId, uploadUrl } = await createUpload(accessToken, {
      sizeBytes: 2 * CHUNK,
    });

    const statuses = await page.evaluate(
      async ({ url, chunk }) => {
        const total = chunk * 2;
        const put = async (start: number) => {
          const response = await fetch(url, {
            method: "PUT",
            headers: {
              "Content-Range": `bytes ${start}-${start + chunk - 1}/${total}`,
            },
            body: new Uint8Array(chunk),
          });
          return response.status;
        };
        return [await put(0), await put(chunk)];
      },
      { url: uploadUrl, chunk: CHUNK },
    );

    expect(statuses).toEqual([308, 200]);
    const completed = await completeUpload(accessToken, itemId);
    expect(completed.status).toBe(200);
    expect(completed.item.sizeBytes).toBe(2 * CHUNK);
  });

  test("envia um arquivo vazio num único PUT", { tag: "@LUI-165-CA6" }, async ({
    page,
    context,
  }) => {
    const accessToken = await accessTokenOf(context);
    const { itemId, uploadUrl } = await createUpload(accessToken, {
      sizeBytes: 0,
    });

    const status = await page.evaluate(
      async (url) => (await fetch(url, { method: "PUT" })).status,
      uploadUrl,
    );

    expect(status).toBe(200);
    const completed = await completeUpload(accessToken, itemId);
    expect(completed.status).toBe(200);
    expect(completed.item.sizeBytes).toBe(0);
  });

  test("entrega ao navegador URLs de sessão e de download que ele alcança", { tag: "@LUI-165-CA7" }, async ({
    page,
    context,
  }) => {
    const content = "conteudo do relatorio";
    const accessToken = await accessTokenOf(context);
    const { itemId, uploadUrl } = await createUpload(accessToken, {
      sizeBytes: content.length,
      mimeType: "application/pdf",
      name: "relatório.pdf",
    });
    const status = await page.evaluate(
      async ({ url, body }) =>
        (await fetch(url, { method: "PUT", body })).status,
      { url: uploadUrl, body: content },
    );
    await completeUpload(accessToken, itemId);
    const readUrl = await downloadUrlOf(accessToken, itemId);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.evaluate((url) => {
        window.location.href = url;
      }, readUrl),
    ]);
    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) {
      chunks.push(chunk as Buffer);
    }

    expect(new URL(uploadUrl).host).toBe("localhost:4443");
    expect(new URL(readUrl).host).toBe("localhost:4443");
    expect(status).toBe(200);
    expect(download.suggestedFilename()).toBe("relatório.pdf");
    expect(Buffer.concat(chunks).toString()).toBe(content);
  });
});
