import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/account";
import { uniqueEmail } from "./support/mailpit";
import { usedBytesOf } from "./support/quota";
import { interceptStorageSession } from "./support/storage-session";
import { chooseFiles, panelOf } from "./support/uploads";

const MiB = 1024 * 1024;

/** O conteúdo conhecido de um arquivo de teste: o mesmo cálculo roda no navegador e aqui. */
const byteAt = (index: number) => (index * 31 + 7) & 255;

function contentOf(size: number): Buffer {
  const content = Buffer.alloc(size);
  for (let index = 0; index < size; index += 1) content[index] = byteAt(index);
  return content;
}

interface DroppedFile {
  name: string;
  size: number;
}

/**
 * Solta arquivos sobre a lista (a Pasta raiz vazia), como a pessoa faz: o Playwright não arrasta
 * arquivos do sistema operacional, então o `DataTransfer` é montado na página, com o conteúdo de
 * `contentOf`.
 */
async function dropFiles(page: Page, files: DroppedFile[], { hover = true } = {}) {
  await page.getByText("Nenhum arquivo ainda").evaluate(
    (list, { files, hover }) => {
      const transfer = new DataTransfer();
      for (const { name, size } of files) {
        const bytes = new Uint8Array(size);
        // A cópia de `byteAt`, que não atravessa para a página: as duas têm de mudar juntas.
        for (let index = 0; index < size; index += 1) bytes[index] = (index * 31 + 7) & 255;
        transfer.items.add(new File([bytes], name, { type: "application/octet-stream" }));
      }
      const fire = (type: string) =>
        list.dispatchEvent(
          new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }),
        );
      fire("dragenter");
      fire("dragover");
      if (!hover) fire("drop");
      (window as unknown as { dropAgain: () => void }).dropAgain = () => fire("drop");
    },
    { files, hover },
  );
}

const dropNow = (page: Page) =>
  page.evaluate(() => (window as unknown as { dropAgain: () => void }).dropAgain());

/**
 * Anota, na página, cada título do painel e cada valor de progresso que passaram pela tela, e se
 * o painel mostrou, em algum momento, um arquivo como falha (a mensagem ou o "Tentar de novo").
 */
async function recordPanel(page: Page) {
  await page.evaluate(() => {
    const seen = { titles: new Set<string>(), progress: new Set<number>(), failed: false };
    (window as unknown as { seen: typeof seen }).seen = seen;
    const read = () => {
      document
        .querySelectorAll('section[aria-label="Envios"] h2')
        .forEach((title) => seen.titles.add(title.textContent ?? ""));
      document
        .querySelectorAll('[role="progressbar"]')
        .forEach((bar) => seen.progress.add(Number(bar.getAttribute("aria-valuenow"))));
      const panel = document.querySelector('section[aria-label="Envios"]');
      const text = panel?.textContent ?? "";
      if (text.includes("A conexão falhou durante o envio") || text.includes("Tentar de novo")) {
        seen.failed = true;
      }
    };
    new MutationObserver(read).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  });
}

const recorded = (page: Page) =>
  page.evaluate(() => {
    const { titles, progress, failed } = (
      window as unknown as {
        seen: { titles: Set<string>; progress: Set<number>; failed: boolean };
      }
    ).seen;
    return { titles: [...titles], progress: [...progress], failed };
  });

test("o Usuário arrasta vários arquivos para a lista, inclusive um maior que um chunk, e acompanha o envio no painel @LUI-170-CA9", async ({
  page,
}) => {
  const email = uniqueEmail();
  await signIn(page, email);
  await interceptStorageSession(page);
  await expect(page.getByText("Nenhum arquivo ainda")).toBeVisible();
  await recordPanel(page);
  await page.evaluate(() => {
    (window as unknown as { marker: string }).marker = "mesma-pagina";
  });

  await dropFiles(page, [
    { name: "grande.bin", size: 9 * MiB },
    { name: "pequeno-1.bin", size: 10 },
    { name: "pequeno-2.bin", size: 20 },
  ]);
  await expect(page.getByText("Enviar para Meus arquivos")).toBeVisible();
  await dropNow(page);

  const panel = panelOf(page);
  await expect(panel.getByText("grande.bin")).toBeVisible();
  await expect(panel.getByText("pequeno-1.bin")).toBeVisible();
  await expect(panel.getByText("pequeno-2.bin")).toBeVisible();
  await expect(panel.getByRole("img", { name: "Concluído" })).toHaveCount(3);
  for (const name of ["grande.bin", "pequeno-1.bin", "pequeno-2.bin"]) {
    await expect(page.getByRole("row", { name: new RegExp(name.replace(".", "\\.")) })).toBeVisible();
  }
  await expect(page.getByText("Enviar para Meus arquivos")).toBeHidden();

  const { titles, progress } = await recorded(page);
  expect(titles).toContain("Enviando 3 de 3");
  // O arquivo grande passou por um valor intermediário: 8 de 9 MiB confirmados (88%).
  expect(progress.filter((value) => value > 0 && value < 100)).toContain(88);
  await expect(page.getByRole("row", { name: /grande\.bin/ })).toContainText("9 MB");
  expect(
    await page.evaluate(() => (window as unknown as { marker?: string }).marker),
  ).toBe("mesma-pagina");
});

test("um chunk que falha no meio é repetido sozinho, e o arquivo chega inteiro @LUI-170-CA10", async ({
  page,
}) => {
  const email = uniqueEmail();
  await signIn(page, email);
  const storage = await interceptStorageSession(page);
  storage.failOnce({ total: 9 * MiB, start: 8 * MiB });
  await recordPanel(page);
  const content = contentOf(9 * MiB);

  await chooseFiles(page, [{ name: "inteiro.bin", buffer: content }]);

  await expect(panelOf(page).getByRole("img", { name: "Concluído" })).toBeVisible({
    timeout: 20_000,
  });
  // Em nenhum momento o painel mostrou o arquivo como falha.
  expect((await recorded(page)).failed).toBe(false);
  // O chunk falhou uma vez: o segundo chunk e a consulta de progresso que veio depois dele.
  expect(storage.requests).toEqual([
    `bytes 0-${8 * MiB - 1}/${9 * MiB}`,
    `bytes ${8 * MiB}-${9 * MiB - 1}/${9 * MiB}`,
    `bytes */${9 * MiB}`,
    `bytes ${8 * MiB}-${9 * MiB - 1}/${9 * MiB}`,
  ]);

  const row = page.getByRole("row", { name: /inteiro\.bin/ });
  await row.getByRole("button", { name: "Mais ações" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Baixar" }).click(),
  ]);
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  const hash = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");
  expect(hash(Buffer.concat(chunks))).toBe(hash(content));
});

test("o Usuário pausa e retoma um envio, e cancela outro, que some sem aparecer na lista @LUI-170-CA11", async ({
  page,
}) => {
  const email = uniqueEmail();
  await signIn(page, email);
  const storage = await interceptStorageSession(page);
  const first = 17 * MiB;
  const second = 17 * MiB + 1;
  const holdFirst = storage.hold({ total: first, start: 8 * MiB });
  const holdSecond = storage.hold({ total: second, start: 8 * MiB });

  await chooseFiles(page, [
    { name: "primeiro.bin", buffer: Buffer.alloc(first) },
    { name: "segundo.bin", buffer: Buffer.alloc(second) },
  ]);
  await Promise.all([holdFirst.reached, holdSecond.reached]);
  const panel = panelOf(page);

  await panel.getByRole("button", { name: "Pausar envio de primeiro.bin" }).click();
  await expect(
    panel.getByRole("button", { name: "Retomar envio de primeiro.bin" }),
  ).toBeVisible();
  await expect(panel.getByText("Pausado")).toBeVisible();
  holdFirst.release();

  await panel.getByRole("button", { name: "Cancelar envio de segundo.bin" }).click();
  await expect(panel.getByText("segundo.bin")).toBeHidden();
  holdSecond.release();

  await panel.getByRole("button", { name: "Retomar envio de primeiro.bin" }).click();
  await expect(panel.getByRole("img", { name: "Concluído" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("row", { name: /primeiro\.bin/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /segundo\.bin/ })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("row", { name: /primeiro\.bin/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /segundo\.bin/ })).toHaveCount(0);
  await expect(page.getByRole("row", { name: /primeiro\.bin/ })).toContainText("17 MB");
  // Exceção à porta pública: nenhuma tela mostra a Cota até a funcionalidade dela; lida no banco.
  await expect.poll(() => usedBytesOf(email)).toBe(first);
});

test("com um envio em andamento, fechar a aba pede confirmação", async ({ page }) => {
  await signIn(page, uniqueEmail());
  const storage = await interceptStorageSession(page);
  const size = 9 * MiB;
  const held = storage.hold({ total: size, start: 0 });
  await chooseFiles(page, [{ name: "em-andamento.bin", buffer: Buffer.alloc(size) }]);
  await held.reached;

  const dialog = page.waitForEvent("dialog", { timeout: 5_000 });
  await page.close({ runBeforeUnload: true });

  const shown = await dialog;
  expect(shown.type()).toBe("beforeunload");
  await shown.dismiss();
});

test("soltar uma pasta junto com arquivos envia só os arquivos e mostra o aviso de pasta solta @LUI-170-CA12", async ({
  page,
}) => {
  // O navegador reconhece a pasta pelo `webkitGetAsEntry()` do item, e um `DataTransfer` montado
  // na página não traz pastas: o item chamado `Fotos` é marcado como pasta.
  await page.addInitScript(() => {
    DataTransferItem.prototype.webkitGetAsEntry = function () {
      const name = this.getAsFile()?.name ?? "";
      return {
        name,
        isDirectory: name === "Fotos",
        isFile: name !== "Fotos",
      } as FileSystemEntry;
    };
  });
  await signIn(page, uniqueEmail());
  await interceptStorageSession(page);

  await dropFiles(page, [
    { name: "Fotos", size: 0 },
    { name: "a.bin", size: 10 },
    { name: "b.bin", size: 20 },
  ]);
  await dropNow(page);

  const panel = panelOf(page);
  const warning = "Pastas não podem ser enviadas. Envie os arquivos de dentro da pasta.";
  await expect(panel.getByText(warning)).toBeVisible();
  await expect(panel.getByRole("img", { name: "Concluído" })).toHaveCount(2);
  await expect(page.getByRole("row", { name: /a\.bin/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /b\.bin/ })).toBeVisible();
  await expect(panel.getByText("Fotos")).toHaveCount(0);
  await expect(page.getByRole("row", { name: /Fotos/ })).toHaveCount(0);

  await panel.getByRole("button", { name: "Fechar envios" }).click();
  await expect(page.getByText(warning)).toHaveCount(0);
});

test("o botão Enviar aceita vários arquivos de uma vez @LUI-170-CA13", async ({
  page,
}) => {
  await signIn(page, uniqueEmail());
  const input = page.locator('input[type="file"]');
  await expect(input).toHaveAttribute("multiple", "");
  await expect(input).not.toHaveAttribute("webkitdirectory", /.*/);

  await chooseFiles(page, [
    { name: "um.txt", buffer: Buffer.from("um") },
    { name: "dois.txt", buffer: Buffer.from("dois") },
    { name: "tres.txt", buffer: Buffer.from("tres") },
  ]);

  await expect(panelOf(page).getByRole("img", { name: "Concluído" })).toHaveCount(3);
  for (const name of ["um", "dois", "tres"]) {
    await expect(page.getByRole("row", { name: new RegExp(`${name}\\.txt`) })).toBeVisible();
  }
});

test("soltar arquivos fora da lista não envia nada e não deixa o navegador abrir o arquivo", async ({
  page,
}) => {
  await signIn(page, uniqueEmail());
  await expect(page.getByText("Nenhum arquivo ainda")).toBeVisible();

  // `dispatchEvent` devolve `false` quando a página cancelou o evento: o navegador não abre o
  // arquivo na aba.
  const accepted = await page.getByRole("banner").evaluate((header) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["fora"], "fora.txt", { type: "text/plain" }));
    const fire = (type: string) =>
      header.dispatchEvent(
        new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }),
      );
    return { dragover: fire("dragover"), drop: fire("drop") };
  });

  expect(accepted).toEqual({ dragover: false, drop: false });
  await expect(page.getByText("Enviar para Meus arquivos")).toHaveCount(0);
  await expect(panelOf(page)).toHaveCount(0);
});
