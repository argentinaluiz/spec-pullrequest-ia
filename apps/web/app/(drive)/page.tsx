import { CloudUpload } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState } from "@/components/files/empty-state";
import { FileList, FileListSkeleton } from "@/components/files/file-list";
import { FileRow } from "@/components/files/file-row";
import { toFileRow } from "@/components/files/format";
import {
  LoadedRows,
  LoadMoreButton,
  LoadMoreProvider,
} from "@/components/files/load-more";
import { getRootItems } from "@/lib/dal/items";
import { loadMoreRootItems } from "./actions";

export const metadata: Metadata = { title: "Meus arquivos" };

const ROOT_FOLDER_NAME = "Meus arquivos";

async function RootFolderContents() {
  const result = await getRootItems();
  if (!result.ok) {
    // A pessoa não é deslogada por uma falha da API: a página mostra o erro.
    throw new Error(
      `Não foi possível listar a Pasta raiz na API (${result.error.status} ${result.error.code}).`,
    );
  }
  const { items, nextCursor } = result.data;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<CloudUpload className="size-12" />}
        title="Nenhum arquivo ainda"
      >
        Arraste arquivos para cá ou clique em Enviar.
      </EmptyState>
    );
  }

  return (
    <LoadMoreProvider initialCursor={nextCursor} load={loadMoreRootItems}>
      <FileList label={ROOT_FOLDER_NAME}>
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

/** "Meus arquivos": a lista da Pasta raiz (docs/lld.md, seção 7.1). */
export default function MyFilesPage() {
  return (
    <main className="flex min-w-0 flex-1 flex-col px-4 pb-4 lg:px-6 lg:pb-6">
      <div className="flex h-12 shrink-0 items-center">
        <h1 className="px-2 text-ui-strong text-ink">{ROOT_FOLDER_NAME}</h1>
      </div>
      <Suspense fallback={<FileListSkeleton />}>
        <RootFolderContents />
      </Suspense>
    </main>
  );
}
