import type { ReactNode } from "react";

type FileListProps = {
  /** O nome da tabela para o leitor de tela: o da pasta. */
  label: string;
  /** As linhas, em `FileRow`, e os grupos de linhas acrescentados no cliente. */
  children: ReactNode;
};

/**
 * O `{component.file-list}`: a lista do Drive em tabela, com o cabeçalho das colunas. A
 * ordenação ao clique entra com a funcionalidade dela.
 */
export function FileList({ label, children }: FileListProps) {
  return (
    <div role="table" aria-label={label} className="flex flex-col bg-canvas">
      <div role="rowgroup">
        <div
          role="row"
          className="flex h-10 items-center gap-3 border-b border-hairline px-4 text-ui-strong text-ink-muted"
        >
          <div role="columnheader" className="min-w-0 flex-1 pl-11">
            Nome
          </div>
          <div role="columnheader" className="hidden w-30 shrink-0 lg:block">
            Tipo
          </div>
          <div role="columnheader" className="hidden w-25 shrink-0 text-right sm:block">
            Tamanho
          </div>
          <div role="columnheader" className="hidden w-35 shrink-0 text-right md:block">
            Modificado em
          </div>
          {/* A coluna do "Mais ações": sem texto na tela, mas com nome, para o cabeçalho ter
              tantas colunas quanto as linhas. */}
          <div role="columnheader" className="size-11 shrink-0 lg:size-9">
            <span className="sr-only">Ações</span>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

/** O lugar da lista enquanto a primeira página chega: linhas em `{colors.surface}`. */
export function FileListSkeleton() {
  return (
    <div aria-hidden className="flex flex-col">
      <div className="h-10 border-b border-hairline" />
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="flex h-12 items-center gap-3 border-b border-hairline px-4"
        >
          <span className="size-8 shrink-0 rounded-sm bg-surface" />
          <span className="h-4 w-1/3 rounded-sm bg-surface motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}
