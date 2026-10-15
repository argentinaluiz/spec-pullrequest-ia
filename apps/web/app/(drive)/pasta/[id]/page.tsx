import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FileListSkeleton } from "@/components/files/file-list";
import { FolderView } from "@/components/files/folder-view";

export const metadata: Metadata = { title: "Pasta" };

/** O id lido dos parâmetros. O `root` não é um endereço de pasta: a Pasta raiz é a página inicial. */
async function OpenFolder({ params }: PageProps<"/pasta/[id]">) {
  const { id } = await params;
  if (id === "root") notFound();
  return <FolderView id={id} />;
}

/** Uma pasta de "Meus arquivos" (docs/lld.md, seção 7.1). */
export default function FolderPage(props: PageProps<"/pasta/[id]">) {
  return (
    <main className="flex min-w-0 flex-1 flex-col px-4 pb-4 lg:px-6 lg:pb-6">
      <Suspense fallback={<FileListSkeleton />}>
        <OpenFolder {...props} />
      </Suspense>
    </main>
  );
}
