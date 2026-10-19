import type { Metadata } from "next";
import { Suspense } from "react";
import { FileListSkeleton } from "@/components/files/file-list";
import { FolderView } from "@/components/files/folder-view";
import { ROOT_FOLDER_LABEL } from "@/lib/drive";

export const metadata: Metadata = { title: ROOT_FOLDER_LABEL };

/** "Meus arquivos": a lista da Pasta raiz (docs/lld.md, seção 7.1). */
export default function MyFilesPage() {
  return (
    <main className="flex min-w-0 flex-1 flex-col px-4 pb-4 lg:px-6 lg:pb-6">
      <Suspense fallback={<FileListSkeleton />}>
        <FolderView id="root" />
      </Suspense>
    </main>
  );
}
