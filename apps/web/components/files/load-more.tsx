"use client";

import { CircleAlert } from "lucide-react";
import {
  createContext,
  use,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { FileRow } from "@/components/files/file-row";
import type { FileRowData } from "@/components/files/format";
import { ButtonUtility } from "@/components/ui/button-utility";

/** O que a Server Action de "Carregar mais" devolve. */
export type LoadMoreResult =
  | { ok: true; rows: FileRowData[]; nextCursor: string | null }
  | { ok: false; message: string };

interface LoadMoreState {
  rows: FileRowData[];
  hasMore: boolean;
  pending: boolean;
  error: string | null;
  loadMore: () => void;
  /** Descarta as páginas acrescentadas e volta à primeira, a do servidor. */
  reset: () => void;
}

const LoadMoreContext = createContext<LoadMoreState | null>(null);

/**
 * Quem muda uma linha por uma ação (como renomear) chama o que esta função devolve, para as
 * páginas acrescentadas não mostrarem o dado antigo: o `router.refresh()` só refaz a primeira
 * página. Fora de uma lista com "Carregar mais", não faz nada.
 */
export function useResetLoadedPages(): () => void {
  return use(LoadMoreContext)?.reset ?? (() => {});
}

function useLoadMore(): LoadMoreState {
  const state = use(LoadMoreContext);
  if (!state) throw new Error("Use dentro de um LoadMoreProvider.");
  return state;
}

type LoadMoreProviderProps = {
  /** O `nextCursor` da primeira página, que o Server Component mostrou. */
  initialCursor: string | null;
  /** A Server Action que traz a página seguinte, já formatada. */
  load: (cursor: string) => Promise<LoadMoreResult>;
  /** A lista, renderizada no servidor, com `LoadedRows` e `LoadMoreButton` dentro. */
  children: ReactNode;
};

/**
 * "Carregar mais" (docs/lld.md, seção 7.1): a primeira página vem do servidor, e as seguintes
 * chegam por Server Action e são acrescentadas no cliente. O cursor fica aqui, e não na URL.
 */
export function LoadMoreProvider({
  initialCursor,
  load,
  children,
}: LoadMoreProviderProps) {
  const [rows, setRows] = useState<FileRowData[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function loadMore() {
    if (!cursor) return;
    setError(null);
    startTransition(async () => {
      const result = await load(cursor);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setRows((current) => [...current, ...result.rows]);
      setCursor(result.nextCursor);
    });
  }

  function reset() {
    setRows([]);
    setCursor(initialCursor);
    setError(null);
  }

  return (
    <LoadMoreContext
      value={{ rows, hasMore: cursor !== null, pending, error, loadMore, reset }}
    >
      {children}
    </LoadMoreContext>
  );
}

/** As linhas das páginas acrescentadas, no fim da tabela. */
export function LoadedRows() {
  const { rows } = useLoadMore();
  if (rows.length === 0) return null;
  return (
    <div role="rowgroup">
      {rows.map((row) => (
        <FileRow key={row.id} row={row} />
      ))}
    </div>
  );
}

/** O botão no fim da lista, que some quando não há mais Itens. */
export function LoadMoreButton() {
  const { hasMore, pending, error, loadMore } = useLoadMore();
  if (!hasMore) return null;
  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <ButtonUtility loading={pending} onClick={loadMore}>
        Carregar mais
      </ButtonUtility>
      {error && (
        <p role="alert" className="flex gap-1 text-caption text-danger">
          <CircleAlert className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
