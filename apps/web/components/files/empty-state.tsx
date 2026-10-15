import type { ReactNode } from "react";

type EmptyStateProps = {
  /** O ícone do Lucide, em 48px. */
  icon: ReactNode;
  title: string;
  children: ReactNode;
};

/**
 * O `{component.empty-state}`: ocupa a área de conteúdo quando não há Itens, com o respiro das
 * telas de decisão.
 */
export function EmptyState({ icon, title, children }: EmptyStateProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center">
      <div className="flex w-100 max-w-full flex-col items-center gap-4 px-4 py-12 text-center">
        <span className="text-ink-muted">{icon}</span>
        <div className="flex flex-col gap-2">
          <h2 className="text-title text-ink">{title}</h2>
          <p className="text-body text-ink-muted">{children}</p>
        </div>
      </div>
    </div>
  );
}
