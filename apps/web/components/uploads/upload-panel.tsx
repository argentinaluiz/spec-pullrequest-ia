"use client";

import { ChevronDown, X } from "lucide-react";
import { useState } from "react";
import { ButtonIcon } from "@/components/ui/button-icon";
import { UploadItem } from "@/components/uploads/upload-item";
import { useUploads } from "@/components/uploads/upload-provider";
import type { UploadEntry } from "@/components/uploads/types";

/** "Enviando 1 de 2" enquanto há envio em andamento, e "2 de 2 enviado" depois, como no Figma. */
export function panelTitle(entries: UploadEntry[]): string {
  const total = entries.length;
  const done = entries.filter((entry) => entry.status === "done").length;
  if (entries.some((entry) => entry.status === "uploading")) {
    return `Enviando ${done + 1} de ${total}`;
  }
  return `${done} de ${total} enviado`;
}

/**
 * O `{component.upload-panel}`: o painel flutuante de envios, no canto inferior direito e, abaixo
 * de `lg`, ancorado ao pé da tela, em largura total. Some quando não há nenhum envio.
 */
export function UploadPanel() {
  const { entries, dismiss, clearFinished } = useUploads();
  const [collapsed, setCollapsed] = useState(false);

  if (entries.length === 0) return null;

  return (
    <section
      aria-label="Envios"
      className="fixed inset-x-0 bottom-0 z-30 overflow-hidden rounded-t-lg border border-hairline bg-surface-raised shadow-overlay lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-90 lg:rounded-lg"
    >
      <header
        className={`flex h-12 items-center gap-1 pr-2 pl-4 ${collapsed ? "" : "border-b border-hairline"}`}
      >
        <h2 className="flex-1 text-ui-strong text-ink" aria-live="polite">
          {panelTitle(entries)}
        </h2>
        <ButtonIcon
          aria-label={collapsed ? "Expandir envios" : "Recolher envios"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((current) => !current)}
        >
          <ChevronDown
            className={`size-5 transition-transform ${collapsed ? "rotate-180" : ""}`}
          />
        </ButtonIcon>
        <ButtonIcon aria-label="Fechar envios" onClick={clearFinished}>
          <X className="size-5" />
        </ButtonIcon>
      </header>
      {!collapsed && (
        <ul className="max-h-60 overflow-y-auto">
          {entries.map((entry) => (
            <UploadItem
              key={entry.key}
              entry={entry}
              onDismiss={() => dismiss(entry.key)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
