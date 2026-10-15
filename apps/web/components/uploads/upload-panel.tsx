"use client";

import { ChevronDown, X } from "lucide-react";
import { useState } from "react";
import { ButtonIcon } from "@/components/ui/button-icon";
import { UploadItem } from "@/components/uploads/upload-item";
import {
  useUploadActions,
  useUploadsState,
} from "@/components/uploads/upload-provider";
import { Banner } from "@/components/ui/banner";
import { FOLDER_DROPPED_MESSAGE, panelTitle } from "@/lib/uploads/panel";

/**
 * O `{component.upload-panel}`: o painel flutuante de envios, no canto inferior direito e, abaixo
 * de `lg`, ancorado ao pé da tela, em largura total. Some quando não há nenhum envio.
 */
export function UploadPanel() {
  const { entries, folderDropped } = useUploadsState();
  const { pause, resume, cancel, retry, selectFile, dismiss, close } = useUploadActions();
  const [collapsed, setCollapsed] = useState(false);

  if (entries.length === 0 && !folderDropped) return null;

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
        <ButtonIcon aria-label="Fechar envios" onClick={close}>
          <X className="size-5" />
        </ButtonIcon>
      </header>
      {!collapsed && (
        <>
          {folderDropped && (
            <div className="p-3">
              <Banner variant="warning" layout="narrow">
                {FOLDER_DROPPED_MESSAGE}
              </Banner>
            </div>
          )}
          <ul className="max-h-60 overflow-y-auto">
            {entries.map((entry) => (
              <UploadItem
                key={entry.key}
                entry={entry}
                onPause={pause}
                onResume={resume}
                onCancel={cancel}
                onRetry={retry}
                onSelectFile={selectFile}
                onDismiss={dismiss}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
