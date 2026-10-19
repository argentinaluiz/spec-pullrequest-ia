import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/account";
import { uniqueEmail } from "./support/mailpit";
import { usedBytesOf } from "./support/quota";
import { interceptStorageSession, type StorageSession } from "./support/storage-session";
import { chooseDiskFiles, panelOf, selectDiskFile, writeDiskFile } from "./support/uploads";

const MiB = 1024 * 1024;
const SIZE = 20 * MiB;
const NAME = "grande.bin";

/**
 * Um Usuário que enviou o primeiro chunk de um arquivo de três e teve o segundo segurado, e a aba
 * recarregada: o painel volta com o envio esperando o arquivo.
 */
async function reloadedMidUpload(page: Page) {
  const email = uniqueEmail();
  await signIn(page, email);
  const storage = await interceptStorageSession(page);
  const path = await writeDiskFile(NAME, Buffer.alloc(SIZE, 7));
  const held = storage.hold({ total: SIZE, start: 8 * MiB });
  // Recarregar com um envio em andamento abre o diálogo de confirmação: a pessoa o aceita.
  page.on("dialog", (dialog) => void dialog.accept());
  await chooseDiskFiles(page, [path]);
  await held.reached;

  // O chunk segurado não é solto: a aba que o pediu já não existe, e o storage fica com o primeiro.
  await page.reload();

  const item = panelOf(page).getByRole("listitem").filter({ hasText: NAME });
  await expect(item.getByText("Selecione o arquivo de novo para continuar")).toBeVisible();
  return { email, storage, path, item };
}

const chunksSince = (storage: StorageSession, from: number) =>
  storage.requests.slice(from).filter((range) => /^bytes \d+-\d+\//.test(range));

test("retoma depois de recarregar a aba sem reenviar o que o storage já tinha", { tag: "@LUI-171-CA6" }, async ({
  page,
}) => {
  const { storage, path, item } = await reloadedMidUpload(page);
  await expect(item.getByText("40%")).toBeVisible();
  const before = storage.requests.length;

  await selectDiskFile(page, NAME, path);

  await expect(page.getByRole("row", { name: /grande\.bin/ })).toContainText("20 MB");
  expect(chunksSince(storage, before)[0]).toBe(`bytes ${8 * MiB}-${16 * MiB - 1}/${SIZE}`);
});

test("recusa um arquivo diferente sem enviar nada", { tag: "@LUI-171-CA7" }, async ({ page }) => {
  const { storage, item } = await reloadedMidUpload(page);
  const other = await writeDiskFile("outro.bin", Buffer.alloc(SIZE, 9));
  const before = storage.requests.length;

  await selectDiskFile(page, NAME, other);

  await expect(item.getByText("Não é o mesmo arquivo. Selecione grande.bin.")).toBeVisible();
  await expect(item.getByRole("button", { name: "Selecionar arquivo" })).toBeVisible();
  expect(storage.requests.slice(before)).toEqual([]);
});

test("cancelar um incompleto o tira do painel e devolve o espaço", { tag: "@LUI-171-CA8" }, async ({
  page,
}) => {
  const { email, item } = await reloadedMidUpload(page);
  await expect.poll(() => usedBytesOf(email)).toBe(SIZE);

  await item.getByRole("button", { name: `Cancelar envio de ${NAME}` }).click();

  await expect(panelOf(page)).toBeHidden();
  await expect.poll(() => usedBytesOf(email)).toBe(0);
  await page.reload();
  await expect(page.getByText("Nenhum arquivo ainda")).toBeVisible();
  await expect(panelOf(page)).toBeHidden();
});

test("o armazenamento local não guarda a URL da sessão", { tag: "@LUI-171-CA9" }, async ({ page }) => {
  await signIn(page, uniqueEmail());
  const storage = await interceptStorageSession(page);
  const path = await writeDiskFile(NAME, Buffer.alloc(SIZE, 7));
  // O segundo chunk fica segurado até o fim do teste: o envio está em andamento, com sessão.
  const held = storage.hold({ total: SIZE, start: 8 * MiB });
  await chooseDiskFiles(page, [path]);
  await held.reached;

  const stored = await page.evaluate(() =>
    Object.keys(localStorage).map((key) => localStorage.getItem(key) ?? ""),
  );

  expect(storage.sessionUrls.length).toBeGreaterThan(0);
  const everything = stored.join("\n");
  expect(everything).toMatch(/"itemId":"[0-9a-f-]{36}"/);
  for (const url of storage.sessionUrls) {
    const uploadId = new URL(url).searchParams.get("upload_id") ?? "";
    expect(uploadId).not.toBe("");
    expect(everything).not.toContain(url);
    expect(everything).not.toContain(uploadId);
  }
});
