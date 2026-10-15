import { CloudUpload } from "lucide-react";
import { EmptyState } from "@/components/files/empty-state";
import { FileTable } from "@/components/files/file-table";
import type { ApiResult, ItemPage } from "@/lib/api/types";
import { loadMoreFolderItems } from "@/app/(drive)/actions";

/**
 * A lista de uma pasta: a primeira página, ou o estado vazio. A leitura já foi disparada por quem
 * monta a página, em paralelo com a do caminho, e esta peça só a espera. Uma falha da API não
 * desloga a pessoa: a página mostra o erro.
 */
export async function FolderContents({
  folderId,
  label,
  page,
}: {
  folderId: string;
  label: string;
  page: Promise<ApiResult<ItemPage>>;
}) {
  const result = await page;
  if (!result.ok) {
    throw new Error(
      `Não foi possível listar a pasta ${folderId} na API (${result.error.status} ${result.error.code}).`,
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
    <FileTable
      label={label}
      items={items}
      nextCursor={nextCursor}
      load={loadMoreFolderItems.bind(null, folderId)}
    />
  );
}
