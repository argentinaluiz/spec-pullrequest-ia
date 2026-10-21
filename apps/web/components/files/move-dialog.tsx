"use client";

import { ChevronRight, CircleAlert, Folder } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ItemTrailEntry } from "@/lib/api/types";
import type { MoveItemResult, MoveLevelResult } from "@/app/(drive)/actions";
import { useResetLoadedPages } from "@/components/files/load-more";
import { ButtonPrimary } from "@/components/ui/button-primary";
import { ButtonSecondary } from "@/components/ui/button-secondary";
import { ButtonUtility } from "@/components/ui/button-utility";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

/** O nível aberto no seletor: o caminho do topo até ele, as pastas dele que já chegaram e o cursor da próxima página. */
type Level = {
  trail: ItemTrailEntry[];
  folders: ItemTrailEntry[];
  nextCursor: string | null;
};

type MoveDialogProps = {
  /** O id do Item movido, pasta ou arquivo: ele aparece desabilitado no seletor, se for uma pasta. */
  id: string;
  /** A Server Action que traz um nível do seletor. */
  loadLevel: (folderId: string, cursor?: string) => Promise<MoveLevelResult>;
  /** A Server Action que move. */
  move: (id: string, parentId: string) => Promise<MoveItemResult>;
  onClose: () => void;
};

/**
 * O diálogo "Mover para…" (docs/design-system.md, `{component.dialog}` com o seletor de pastas):
 * o caminho do nível atual no topo e, abaixo, as pastas dele, que se percorrem um nível por vez. O
 * Item movido, se for uma pasta, aparece desabilitado, e por isso as descendentes dele nunca são
 * oferecidas. "Mover" confirma o nível atual como destino, "Meus arquivos" inclusive. O erro da
 * API aparece no diálogo, sem fechá-lo.
 */
export function MoveDialog({ id, loadLevel, move, onClose }: MoveDialogProps) {
  const router = useRouter();
  const toast = useToast();
  const resetLoadedPages = useResetLoadedPages();
  const [level, setLevel] = useState<Level | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [navigating, startNavigation] = useTransition();
  const [moving, startMoving] = useTransition();
  const list = useRef<HTMLUListElement>(null);

  /** Abre o nível `folderId`, trocando o que o seletor mostra. */
  function open(folderId: string) {
    setError(null);
    startNavigation(async () => {
      const result = await loadLevel(folderId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setLevel({
        trail: result.trail ?? [],
        folders: result.folders,
        nextCursor: result.nextCursor,
      });
    });
  }

  function loadMore() {
    const current = level;
    if (!current?.nextCursor) return;
    const folderId = current.trail.at(-1)?.id ?? "root";
    const cursor = current.nextCursor;
    setError(null);
    startNavigation(async () => {
      const result = await loadLevel(folderId, cursor);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setLevel({
        ...current,
        folders: [...current.folders, ...result.folders],
        nextCursor: result.nextCursor,
      });
    });
  }

  function confirm() {
    const destination = level?.trail.at(-1);
    if (!destination) return;
    setError(null);
    startMoving(async () => {
      const result = await move(id, destination.id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.show(`Movido para “${destination.name}”.`);
      resetLoadedPages();
      router.refresh();
      onClose();
    });
  }

  useEffect(() => {
    // Cancelável, porque o Strict Mode monta o efeito duas vezes: só a última resposta vale.
    let cancelled = false;
    void loadLevel("root").then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setLevel({
        trail: result.trail ?? [],
        folders: result.folders,
        nextCursor: result.nextCursor,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [loadLevel]);

  const current = level?.trail.at(-1);
  const currentId = current?.id;
  useEffect(() => {
    // Cada nível aberto leva o foco à primeira pasta que se pode abrir, para o teclado seguir.
    list.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [currentId]);

  return (
    <Dialog title="Mover para…" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <nav aria-label="Caminho do destino">
          <ol className="flex flex-wrap items-center gap-1 text-ui text-ink">
            {level?.trail.map((entry, index) => {
              const isCurrent = index === level.trail.length - 1;
              return (
                <li key={entry.id} className="flex items-center gap-1">
                  {index > 0 && (
                    <ChevronRight className="size-4 text-ink-muted" />
                  )}
                  {isCurrent ? (
                    <span aria-current="location" className="text-ui-strong">
                      {entry.name}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => open(entry.id)}
                      className="focus-ring rounded-sm text-ink-muted hover:text-ink"
                    >
                      {entry.name}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
        <ul
          ref={list}
          aria-label="Pastas"
          aria-busy={navigating || undefined}
          className="max-h-80 overflow-y-auto"
        >
          {level?.folders.map((folder) => (
            <li key={folder.id}>
              <button
                type="button"
                disabled={folder.id === id}
                onClick={() => open(folder.id)}
                className="focus-ring flex h-9 w-full items-center gap-3 rounded-sm px-2 text-left text-ui text-ink not-disabled:hover:bg-surface-hover disabled:text-ink-disabled"
              >
                <Folder className="size-4 shrink-0" />
                <span className="truncate">{folder.name}</span>
              </button>
            </li>
          ))}
          {level?.folders.length === 0 && (
            <li className="px-2 py-2 text-ui text-ink-muted">
              Não há pastas aqui.
            </li>
          )}
          {level?.nextCursor && (
            <li className="flex justify-center py-2">
              <ButtonUtility loading={navigating} onClick={loadMore}>
                Carregar mais
              </ButtonUtility>
            </li>
          )}
        </ul>
        {error && (
          <p role="alert" className="flex gap-1 text-caption text-danger">
            <CircleAlert className="size-4 shrink-0" />
            {error}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <ButtonSecondary onClick={onClose}>Cancelar</ButtonSecondary>
        <ButtonPrimary
          loading={moving}
          disabled={!current || navigating}
          onClick={confirm}
        >
          Mover
        </ButtonPrimary>
      </div>
    </Dialog>
  );
}
