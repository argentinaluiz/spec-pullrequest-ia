import {
  File,
  FileMusic,
  FileText,
  FileVideoCamera,
  Folder,
  Image as ImageIcon,
  type LucideIcon,
} from "lucide-react";
import type { FileKind, FileRowData } from "@/components/files/format";

const ICONS: Record<FileKind, LucideIcon> = {
  folder: Folder,
  pdf: FileText,
  image: ImageIcon,
  video: FileVideoCamera,
  audio: FileMusic,
  text: FileText,
  file: File,
};

/**
 * O `{component.file-row}`: ícone do tipo, nome, tipo, tamanho e data. As colunas saem da
 * direita para a esquerda conforme a largura diminui, e o tamanho e a data vão para uma
 * segunda linha, sob o nome. Seleção e o menu de ações entram com as funcionalidades donas.
 */
export function FileRow({ row }: { row: FileRowData }) {
  const Icon = ICONS[row.kind];

  return (
    <div
      role="row"
      className="flex h-12 items-center gap-3 border-b border-hairline bg-canvas px-4"
    >
      <div role="cell" className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-sm text-ink-muted">
          <Icon className="size-4" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-ui text-ink">{row.name}</span>
          <span className="truncate text-caption text-ink-muted md:hidden">
            <span className="sm:hidden">{row.size} · </span>
            {row.modifiedAt}
          </span>
        </span>
      </div>
      <div role="cell" className="hidden w-30 shrink-0 font-mono text-mono text-ink-muted lg:block">
        {row.typeLabel}
      </div>
      <div
        role="cell"
        className="hidden w-25 shrink-0 text-right font-mono text-mono text-ink-muted tabular-nums sm:block"
      >
        {row.size}
      </div>
      <div
        role="cell"
        className="hidden w-35 shrink-0 text-right font-mono text-mono text-ink-muted tabular-nums md:block"
      >
        {row.modifiedAt}
      </div>
    </div>
  );
}
