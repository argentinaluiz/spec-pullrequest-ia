import type { UploadEntry } from "@/lib/uploads/types";

/** O aviso do painel quando a pessoa solta uma pasta, que não é enviada (docs/lld.md, seção 7.4). */
export const FOLDER_DROPPED_MESSAGE =
  "Pastas não podem ser enviadas. Envie os arquivos de dentro da pasta.";

/**
 * O título do painel: "Enviando 3 de 5" enquanto há arquivo enviando ou na fila (3 enviam entre
 * 5 no painel), "Envio pausado" quando só restam pausados, e "2 de 2 enviado" depois, como no Figma.
 */
export function panelTitle(entries: UploadEntry[]): string {
  const count = (status: UploadEntry["status"]) =>
    entries.filter((entry) => entry.status === status).length;
  const total = entries.length;
  if (count("uploading") > 0 || count("queued") > 0) {
    return `Enviando ${count("uploading")} de ${total}`;
  }
  if (count("paused") > 0) return "Envio pausado";
  return `${count("done")} de ${total} enviado`;
}
