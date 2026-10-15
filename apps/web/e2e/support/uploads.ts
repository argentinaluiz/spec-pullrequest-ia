import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FileChooser, Page } from "@playwright/test";

/** Um arquivo escolhido no seletor. Sem `mimeType`, vai como `application/octet-stream`. */
export interface ChosenFile {
  name: string;
  buffer: Buffer;
  mimeType?: string;
}

/** Clica em "Enviar" e escolhe os arquivos no seletor, como a pessoa faz. */
export async function chooseFiles(page: Page, files: ChosenFile[]) {
  await chooseWith(
    page,
    files.map(({ name, buffer, mimeType }) => ({
      name,
      mimeType: mimeType ?? "application/octet-stream",
      buffer,
    })),
  );
}

/** Clica em "Enviar" e entrega o que escolher ao seletor de arquivos. */
async function chooseWith(page: Page, files: Parameters<FileChooser["setFiles"]>[0]) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Enviar" }).click();
  await (await chooser).setFiles(files);
}

/** O painel de envios. */
export const panelOf = (page: Page) => page.getByRole("region", { name: "Envios" });

/**
 * Grava um arquivo numa pasta temporária do contêiner e devolve o caminho. A impressão de um
 * arquivo inclui a data de modificação, e um arquivo montado em memória ganha uma data nova a cada
 * seleção: só o do disco é "o mesmo arquivo" nas duas vezes em que é escolhido.
 */
export async function writeDiskFile(name: string, content: Buffer): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), "envio-")), name);
  await writeFile(path, content);
  return path;
}

/** Clica em "Enviar" e escolhe arquivos do disco pelo caminho. */
export async function chooseDiskFiles(page: Page, paths: string[]) {
  await chooseWith(page, paths);
}

/** Clica em "Selecionar arquivo" no item do painel e escolhe o arquivo do disco pelo caminho. */
export async function selectDiskFile(page: Page, itemName: string, path: string) {
  const item = panelOf(page).getByRole("listitem").filter({ hasText: itemName });
  const chooser = page.waitForEvent("filechooser");
  await item.getByRole("button", { name: "Selecionar arquivo" }).click();
  await (await chooser).setFiles(path);
}
