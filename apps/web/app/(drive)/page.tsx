import type { Metadata } from "next";

export const metadata: Metadata = { title: "Meus arquivos" };

/** "Meus arquivos": a lista da Pasta raiz (docs/lld.md, seção 7.1). */
export default function MyFilesPage() {
  return (
    <main className="flex min-w-0 flex-1 flex-col px-4 pb-4 lg:px-6 lg:pb-6">
      <div className="flex h-12 shrink-0 items-center">
        <h1 className="px-2 text-ui-strong text-ink">Meus arquivos</h1>
      </div>
    </main>
  );
}
