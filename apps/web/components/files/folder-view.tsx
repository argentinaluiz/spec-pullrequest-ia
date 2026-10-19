import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createFolder } from "@/app/(drive)/actions";
import { Dropzone } from "@/components/files/dropzone";
import { FileListSkeleton } from "@/components/files/file-list";
import { FolderContents } from "@/components/files/folder-contents";
import { NewFolderButton } from "@/components/files/new-folder-button";
import { Breadcrumb } from "@/components/navigation/breadcrumb";
import { getFolder, getFolderItems } from "@/lib/dal/items";

/**
 * Uma pasta aberta (`root` para "Meus arquivos", ou o id dela): o breadcrumb, a barra de
 * ferramentas com "Nova pasta" e a lista, que é a zona de soltar. A leitura da lista começa junto
 * com a do caminho, e o caminho não a segura. Uma pasta que não é do Usuário mostra a página de
 * não encontrado; outra falha da API derruba a página, sem deslogar a pessoa.
 */
export async function FolderView({ id }: { id: string }) {
  const page = getFolderItems(id);
  // Se o caminho falhar antes de a lista ser esperada, a lista não fica com rejeição sem
  // tratamento. Quem a espera, o `FolderContents`, continua recebendo o erro.
  page.catch(() => {});
  const result = await getFolder(id);
  if (!result.ok) {
    if (result.error.code === "not_found") notFound();
    throw new Error(
      `Não foi possível ler a pasta ${id} na API (${result.error.status} ${result.error.code}).`,
    );
  }
  const { item, trail } = result.data;

  return (
    <>
      <div className="flex h-12 shrink-0 items-center">
        <Breadcrumb trail={trail} />
      </div>
      <div className="flex h-12 shrink-0 items-center">
        <NewFolderButton parentId={item.id} create={createFolder} />
      </div>
      <Dropzone folderName={item.name} parentId={item.id}>
        <Suspense fallback={<FileListSkeleton />}>
          <FolderContents folderId={item.id} label={item.name} page={page} />
        </Suspense>
      </Dropzone>
    </>
  );
}
