import { expect, test } from "@playwright/test";
import {
  createUploadSession,
  deleteObject,
  objectSize,
  signReadUrl,
  uniqueObjectName,
} from "./support/storage";

const CHUNK = 256 * 1024;

test.describe("Emulador de storage", () => {
  let objectName: string;

  test.beforeEach(async ({ page }) => {
    objectName = uniqueObjectName();
    // O PUT parte de uma página da web, que é a origem de onde o upload vai sair.
    await page.goto("/entrar");
  });

  test.afterEach(async () => {
    await deleteObject(objectName);
  });

  test("envia o arquivo em 2 chunks, com 308 no primeiro e 200 no segundo @LUI-165-CA5", async ({
    page,
  }) => {
    const sessionUrl = await createUploadSession(objectName);

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
      { url: sessionUrl, chunk: CHUNK },
    );

    expect(statuses).toEqual([308, 200]);
    expect(await objectSize(objectName)).toBe(2 * CHUNK);
  });

  test("envia um arquivo vazio num único PUT @LUI-165-CA6", async ({ page }) => {
    const sessionUrl = await createUploadSession(objectName);

    const status = await page.evaluate(
      async (url) => (await fetch(url, { method: "PUT" })).status,
      sessionUrl,
    );

    expect(status).toBe(200);
    expect(await objectSize(objectName)).toBe(0);
  });

  test("entrega ao navegador URLs de sessão e de download que ele alcança @LUI-165-CA7", async ({
    page,
  }) => {
    const sessionUrl = await createUploadSession(objectName, "application/pdf");
    const status = await page.evaluate(
      async (url) =>
        (await fetch(url, { method: "PUT", body: "conteudo do relatorio" }))
          .status,
      sessionUrl,
    );
    const readUrl = await signReadUrl(objectName, "relatório.pdf");

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

    expect(new URL(sessionUrl).host).toBe("localhost:4443");
    expect(new URL(readUrl).host).toBe("localhost:4443");
    expect(status).toBe(200);
    expect(download.suggestedFilename()).toBe("relatório.pdf");
    expect(Buffer.concat(chunks).toString()).toBe("conteudo do relatorio");
  });
});
