import { FolderX } from "lucide-react";
import { EmptyState } from "@/components/files/empty-state";
import { TextLink } from "@/components/ui/text-link";
import { ROOT_FOLDER_LABEL } from "@/lib/drive";

/** O endereço de uma pasta que não é do Usuário: a página de "não encontrado" da casca do Drive. */
export default function FolderNotFound() {
  return (
    <main className="flex min-w-0 flex-1 flex-col px-4 pb-4 lg:px-6 lg:pb-6">
      <EmptyState icon={<FolderX className="size-12" />} title="Pasta não encontrada">
        Ela não existe ou você não tem acesso a ela.{" "}
        <TextLink href="/">Voltar para {ROOT_FOLDER_LABEL}</TextLink>
      </EmptyState>
    </main>
  );
}
