import { expect, test } from "@playwright/test";
import { signIn } from "./support/account";
import { uniqueEmail } from "./support/mailpit";
import { accessTokenOf } from "./support/session";
import { interceptStorageSession } from "./support/storage-session";
import { completeUpload, createUpload } from "./support/storage";

const CHUNK = 256 * 1024;

// Prova do auxiliar de `e2e/support/storage-session.ts`, que os testes de envio em chunks usam.
test("o auxiliar expõe o Range da 308, responde à consulta de progresso e deixa o envio terminar", async ({
  page,
  context,
}) => {
  await signIn(page, uniqueEmail());
  const storage = await interceptStorageSession(page);
  const accessToken = await accessTokenOf(context);
  const { itemId, uploadUrl } = await createUpload(accessToken, {
    sizeBytes: 2 * CHUNK,
  });

  const responses = await page.evaluate(
    async ({ url, chunk }) => {
      const total = chunk * 2;
      const put = async (contentRange: string, size: number) => {
        const response = await fetch(url, {
          method: "PUT",
          headers: { "Content-Range": contentRange },
          body: size > 0 ? new Uint8Array(size) : null,
        });
        return { status: response.status, range: response.headers.get("Range") };
      };
      return [
        await put(`bytes 0-${chunk - 1}/${total}`, chunk),
        await put(`bytes */${total}`, 0),
        await put(`bytes ${chunk}-${total - 1}/${total}`, chunk),
      ];
    },
    { url: uploadUrl, chunk: CHUNK },
  );

  expect(responses.map(({ status }) => status)).toEqual([308, 308, 200]);
  expect(responses.slice(0, 2).map(({ range }) => range)).toEqual([
    `bytes=0-${CHUNK - 1}`,
    `bytes=0-${CHUNK - 1}`,
  ]);
  // A consulta de progresso não chegou ao emulador: ele a trataria como o fim do envio.
  expect(storage.requests).toHaveLength(3);
  expect((await completeUpload(accessToken, itemId)).status).toBe(200);
});
