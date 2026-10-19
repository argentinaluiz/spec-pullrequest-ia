"use client";

import { FolderPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import type { CreateFolderResult } from "@/app/(drive)/actions";
import { ButtonPrimary } from "@/components/ui/button-primary";
import { ButtonSecondary } from "@/components/ui/button-secondary";
import { ButtonUtility } from "@/components/ui/button-utility";
import { Dialog } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";

type NewFolderButtonProps = {
  /** `root` ou o id da pasta aberta, onde a nova pasta nasce. */
  parentId: string;
  /** A Server Action que cria a pasta. */
  create: (parentId: string, name: string) => Promise<CreateFolderResult>;
};

/** O "Nova pasta" da barra de ferramentas: abre o diálogo com o campo de nome. */
export function NewFolderButton({ parentId, create }: NewFolderButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ButtonUtility icon={<FolderPlus className="size-4" />} onClick={() => setOpen(true)}>
        Nova pasta
      </ButtonUtility>
      {/* Montado só enquanto aberto: cada abertura recomeça com o campo vazio e sem erro. */}
      {open && (
        <NewFolderDialog
          parentId={parentId}
          create={create}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** O erro do último envio e o nome que foi enviado: o React limpa o formulário depois da ação, e o nome digitado volta. */
type FormState = { error: string | null; name: string };

/**
 * O diálogo com o campo de nome. O erro de nome inválido ou de profundidade aparece abaixo do
 * campo, em português, sem fechar o diálogo. Criada a pasta, o diálogo fecha, a lista é atualizada
 * e um aviso confirma. A pessoa continua na pasta em que estava.
 */
function NewFolderDialog({
  parentId,
  create,
  onClose,
}: NewFolderButtonProps & { onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();

  const [state, submit, pending] = useActionState<FormState, FormData>(
    async (_previous, formData) => {
      const raw = formData.get("name");
      const name = typeof raw === "string" ? raw : "";
      const result = await create(parentId, name);
      if (!result.ok) return { error: result.message, name };
      toast.show(`Pasta “${result.name}” criada.`);
      router.refresh();
      onClose();
      return { error: null, name: "" };
    },
    { error: null, name: "" },
  );

  return (
    <Dialog title="Nova pasta" onClose={onClose}>
      <form action={submit} noValidate className="flex flex-col gap-4">
        <TextField
          name="name"
          label="Nome da pasta"
          autoComplete="off"
          autoFocus
          defaultValue={state.name}
          error={state.error ?? undefined}
        />
        <div className="flex justify-end gap-2">
          <ButtonSecondary onClick={onClose}>Cancelar</ButtonSecondary>
          <ButtonPrimary type="submit" loading={pending}>
            Criar
          </ButtonPrimary>
        </div>
      </form>
    </Dialog>
  );
}
