import {
  Download,
  EllipsisVertical,
  File,
  FileMusic,
  FileText,
  FileVideoCamera,
  Folder,
  Image as ImageIcon,
  type LucideIcon,
} from "lucide-react";
import type { FileKind, FileRowData } from "@/components/files/format";
import { OpenableRow } from "@/components/files/openable-row";
import { buttonIconClassName } from "@/components/ui/button-icon";
import { Menu, MenuLink } from "@/components/ui/menu";
import { folderPath } from "@/lib/drive";

const ROW_CLASS_NAME =
  "flex h-12 items-center gap-3 border-b border-hairline bg-canvas px-4";

/** O ícone de cada tipo, que é como os tipos se distinguem. */
export const FILE_KIND_ICONS: Record<FileKind, LucideIcon> = {
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
 * segunda linha, sob o nome. Uma linha de arquivo tem o menu "Mais ações", só com "Baixar"; a de
 * pasta não tem, porque ainda não há ação de pasta, e abre a pasta com dois cliques ou com Enter.
 * A seleção entra com a funcionalidade dela.
 */
export function FileRow({ row }: { row: FileRowData }) {
  const Icon = FILE_KIND_ICONS[row.kind];

  const cells = (
    <>
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
      <div role="cell" className="flex size-11 shrink-0 items-center justify-center lg:size-9">
        {row.kind !== "folder" && (
          // O menu é de cliente, e a linha continua no servidor: os ícones atravessam a
          // fronteira como elementos, já renderizados.
          <Menu
            label="Mais ações"
            triggerClassName={buttonIconClassName(36)}
            trigger={<EllipsisVertical className="size-5" />}
            widthClassName="w-55"
          >
            <MenuLink icon={<Download />} href={`/arquivos/${row.id}/baixar`}>
              Baixar
            </MenuLink>
          </Menu>
        )}
      </div>
    </>
  );

  if (row.kind === "folder") {
    return (
      <OpenableRow href={folderPath(row.id)} className={ROW_CLASS_NAME}>
        {cells}
      </OpenableRow>
    );
  }
  return (
    <div role="row" className={ROW_CLASS_NAME}>
      {cells}
    </div>
  );
}
