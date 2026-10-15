import { FileList } from "@/components/files/file-list";
import { FileRow } from "@/components/files/file-row";
import { toFileRow } from "@/components/files/format";
import {
  LoadedRows,
  LoadMoreButton,
  LoadMoreProvider,
  type LoadMoreResult,
} from "@/components/files/load-more";
import type { Item } from "@/lib/api/types";

/**
 * A lista de uma pasta montada: a primeira página, desenhada no servidor, as páginas que o
 * "Carregar mais" acrescenta e o botão. `nextCursor` nulo é a última página. A página e a
 * vitrine usam esta peça, para a vitrine não se afastar da lista real.
 */
export function FileTable({
  label,
  items,
  nextCursor,
  load,
}: {
  label: string;
  items: Item[];
  nextCursor: string | null;
  load: (cursor: string) => Promise<LoadMoreResult>;
}) {
  return (
    <LoadMoreProvider initialCursor={nextCursor} load={load}>
      <FileList label={label}>
        <div role="rowgroup">
          {items.map((item) => (
            <FileRow key={item.id} row={toFileRow(item)} />
          ))}
        </div>
        <LoadedRows />
      </FileList>
      <LoadMoreButton />
    </LoadMoreProvider>
  );
}
