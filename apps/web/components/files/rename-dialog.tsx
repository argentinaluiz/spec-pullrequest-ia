"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import type { RenameItemResult } from "@/app/(drive)/actions";
import { useResetLoadedPages } from "@/components/files/load-more";
import { ButtonPrimary } from "@/components/ui/button-primary";
import { ButtonSecondary } from "@/components/ui/button-secondary";
import { Dialog } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";

type RenameDialogProps = {
  /** O id do Item, pasta ou arquivo. */
  id: string;
  /** O nome atual, que o campo mostra selecionado por inteiro. */
  name: string;
  /** A Server Action que renomeia. */
  rename: (id: string, name: string) => Promise<RenameItemResult>;
  onClose: () => void;
};

/** O erro do último envio e o nome que foi enviado: o React limpa o formulário depois da ação, e o nome digitado volta. */
type FormState = { error: string | null; name: string };

/**
 * O diálogo de renomear, com o nome atual no campo, todo selecionado (a extensão de um arquivo
 * inclusive). O erro de nome inválido aparece abaixo do campo, em português, sem fechar o diálogo.
 * Renomeado o Item, o diálogo fecha, a lista é atualizada e um aviso confirma.
 */
export function RenameDialog({ id, name, rename, onClose }: RenameDialogProps) {
  const router = useRouter();
  const toast = useToast();
  const resetLoadedPages = useResetLoadedPages();

  const [state, submit, pending] = useActionState<FormState, FormData>(
    async (_previous, formData) => {
      const raw = formData.get("name");
      const sent = typeof raw === "string" ? raw : "";
      const result = await rename(id, sent);
      if (!result.ok) return { error: result.message, name: sent };
      toast.show(`Renomeado para “${result.name}”.`);
      resetLoadedPages();
      router.refresh();
      onClose();
      return { error: null, name: result.name };
    },
    { error: null, name },
  );

  return (
    <Dialog title="Renomear" onClose={onClose}>
      <form action={submit} noValidate className="flex flex-col gap-4">
        <TextField
          name="name"
          label="Nome"
          autoComplete="off"
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          defaultValue={state.name}
          error={state.error ?? undefined}
        />
        <div className="flex justify-end gap-2">
          <ButtonSecondary onClick={onClose}>Cancelar</ButtonSecondary>
          <ButtonPrimary type="submit" loading={pending}>
            Renomear
          </ButtonPrimary>
        </div>
      </form>
    </Dialog>
  );
}
