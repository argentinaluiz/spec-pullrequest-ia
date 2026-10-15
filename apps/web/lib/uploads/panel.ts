import type { UploadEntry } from "@/lib/uploads/types";

/** O aviso do painel quando a pessoa solta uma pasta, que não é enviada (docs/lld.md, seção 7.4). */
export const FOLDER_DROPPED_MESSAGE =
  "Pastas não podem ser enviadas. Envie os arquivos de dentro da pasta.";

/**
 * O título do painel, como no Figma: "Enviando 3 de 5" enquanto há arquivo enviando, pausado ou
 * na fila (3 enviando ou pausados entre 5 no painel), e "2 de 2 enviado" quando todos terminaram.
 */
export function panelTitle(entries: UploadEntry[]): string {
  const count = (status: UploadEntry["status"]) =>
    entries.filter((entry) => entry.status === status).length;
  const total = entries.length;
  const sending = count("uploading") + count("paused");
  if (sending > 0 || count("queued") > 0) return `Enviando ${sending} de ${total}`;
  return `${count("done")} de ${total} enviado`;
}
