import type { Item } from "@/lib/api/types";

/*
 * Como um Item aparece na lista (docs/lld.md, seção 7.1, "Linha da lista hoje"). Funções puras,
 * usadas no servidor: a página e a Server Action de "Carregar mais" entregam as linhas já
 * formatadas, e o navegador não recebe o Item inteiro da API.
 */

/** A forma do ícone do tipo, que é como os tipos se distinguem (nunca por cor). */
export type FileKind =
  | "folder"
  | "pdf"
  | "image"
  | "video"
  | "audio"
  | "text"
  | "file";

/** O que uma linha da lista mostra. */
export interface FileRowData {
  id: string;
  name: string;
  kind: FileKind;
  typeLabel: string;
  size: string;
  modifiedAt: string;
}

/** Os rótulos do Figma. */
const TYPE_LABELS: Record<FileKind, string> = {
  folder: "Pasta",
  pdf: "PDF",
  image: "Imagem",
  video: "Vídeo",
  audio: "Áudio",
  text: "Texto",
  file: "Arquivo",
};

export function fileKind(item: Pick<Item, "type" | "mimeType">): FileKind {
  if (item.type === "folder") return "folder";
  const mimeType = (item.mimeType ?? "").toLowerCase();
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("text/")) return "text";
  return "file";
}

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"];

/** Em base 1024, com até uma casa decimal: "4 KB", "2,4 MB", "1,2 GB". */
export function formatSize(bytes: number): string {
  let value = bytes;
  let unit = 0;
  // Arredonda antes de comparar, para 1023,96 KB sair "1 MB", e não "1.024 KB".
  while (Math.round(value * 10) / 10 >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const number = new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
  return `${number} ${SIZE_UNITS[unit]}`;
}

/**
 * "12 out. 2026", no fuso de São Paulo: o Server Component roda em UTC, e uma data perto da
 * meia-noite cairia no dia seguinte.
 */
const DATE_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

export function formatDate(iso: string): string {
  const parts = DATE_FORMAT.formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("day")} ${part("month")} ${part("year")}`;
}

export function toFileRow(item: Item): FileRowData {
  const kind = fileKind(item);
  return {
    id: item.id,
    name: item.name,
    kind,
    typeLabel: TYPE_LABELS[kind],
    // Uma pasta não tem tamanho próprio.
    size: item.type === "folder" ? "—" : formatSize(item.sizeBytes),
    modifiedAt: formatDate(item.updatedAt),
  };
}
