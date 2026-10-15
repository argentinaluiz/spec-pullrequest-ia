"use client";

import { Download, EllipsisVertical, Pencil } from "lucide-react";
import { useState } from "react";
import type { RenameItemResult } from "@/app/(drive)/actions";
import { RenameDialog } from "@/components/files/rename-dialog";
import { buttonIconClassName } from "@/components/ui/button-icon";
import { Menu, MenuItem, MenuLink } from "@/components/ui/menu";

type RowActionsProps = {
  id: string;
  name: string;
  /** Só o arquivo se baixa. */
  downloadable: boolean;
  /** A Server Action que renomeia. */
  rename: (id: string, name: string) => Promise<RenameItemResult>;
};

/**
 * O "Mais ações" de uma linha: "Baixar" (só no arquivo) e "Renomear". O diálogo mora aqui, e não
 * dentro do menu, porque o menu desmonta os itens ao fechar e levaria o diálogo junto.
 */
export function RowActions({ id, name, downloadable, rename }: RowActionsProps) {
  const [renaming, setRenaming] = useState(false);
  return (
    <>
      <Menu
        label="Mais ações"
        triggerClassName={buttonIconClassName(36)}
        trigger={<EllipsisVertical className="size-5" />}
        widthClassName="w-55"
      >
        {downloadable && (
          <MenuLink icon={<Download />} href={`/arquivos/${id}/baixar`}>
            Baixar
          </MenuLink>
        )}
        <MenuItem icon={<Pencil />} closeOnClick onClick={() => setRenaming(true)}>
          Renomear
        </MenuItem>
      </Menu>
      {/* Montado só enquanto aberto: cada abertura recomeça com o nome atual selecionado. */}
      {renaming && (
        <RenameDialog
          id={id}
          name={name}
          rename={rename}
          onClose={() => setRenaming(false)}
        />
      )}
    </>
  );
}
