import type { Page } from "@playwright/test";

/** Um arquivo escolhido no seletor. Sem `mimeType`, vai como `application/octet-stream`. */
export interface ChosenFile {
  name: string;
  buffer: Buffer;
  mimeType?: string;
}

/** Clica em "Enviar" e escolhe os arquivos no seletor, como a pessoa faz. */
export async function chooseFiles(page: Page, files: ChosenFile[]) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Enviar" }).click();
  await (await chooser).setFiles(
    files.map(({ name, buffer, mimeType }) => ({
      name,
      mimeType: mimeType ?? "application/octet-stream",
      buffer,
    })),
  );
}

/** O painel de envios. */
export const panelOf = (page: Page) => page.getByRole("region", { name: "Envios" });
