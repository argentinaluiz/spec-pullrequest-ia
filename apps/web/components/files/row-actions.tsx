"use client";

import { Download, EllipsisVertical, FolderInput, Pencil } from "lucide-react";
import { useState } from "react";
import type {
  MoveItemResult,
  MoveLevelResult,
  RenameItemResult,
} from "@/app/(drive)/actions";
import { MoveDialog } from "@/components/files/move-dialog";
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
  /** A Server Action que traz um nível do seletor de "Mover para…". */
  loadMoveLevel: (folderId: string, cursor?: string) => Promise<MoveLevelResult>;
  /** A Server Action que move. */
  move: (id: string, parentId: string) => Promise<MoveItemResult>;
};

/**
 * O "Mais ações" de uma linha: "Baixar" (só no arquivo), "Renomear" e "Mover para…". Os diálogos
 * moram aqui, e não dentro do menu, porque o menu desmonta os itens ao fechar e levaria o diálogo
 * junto.
 */
export function RowActions({
  id,
  name,
  downloadable,
  rename,
  loadMoveLevel,
  move,
}: RowActionsProps) {
  const [renaming, setRenaming] = useState(false);
  const [moving, setMoving] = useState(false);
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
        <MenuItem icon={<FolderInput />} closeOnClick onClick={() => setMoving(true)}>
          Mover para…
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
      {moving && (
        <MoveDialog
          id={id}
          loadLevel={loadMoveLevel}
          move={move}
          onClose={() => setMoving(false)}
        />
      )}
    </>
  );
}
