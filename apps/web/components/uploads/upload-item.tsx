"use client";

import { CircleAlert, CircleCheck, Pause, Play, RotateCw, X } from "lucide-react";
import { memo, type ReactNode } from "react";
import { FILE_KIND_ICONS } from "@/components/files/file-row";
import { fileKind } from "@/components/files/format";
import { ButtonIcon } from "@/components/ui/button-icon";
import { ButtonUtility } from "@/components/ui/button-utility";
import { canRetry } from "@/lib/uploads/engine";
import type { UploadEntry } from "@/lib/uploads/types";

/** As ações de uma linha recebem a chave do envio, para o painel passar sempre as mesmas funções. */
type UploadItemProps = {
  entry: UploadEntry;
  onPause: (key: string) => void;
  onResume: (key: string) => void;
  onCancel: (key: string) => void;
  onRetry: (key: string) => void;
  /** Tira o item do painel. Só os envios que falharam o oferecem. */
  onDismiss: (key: string) => void;
};

function ProgressBar({ entry }: { entry: UploadEntry }) {
  return (
    <div
      role="progressbar"
      aria-label={`Envio de ${entry.name}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={entry.progress}
      className="mt-1 h-0.5 w-full overflow-hidden bg-hairline"
    >
      <div className="h-full bg-primary" style={{ width: `${entry.progress}%` }} />
    </div>
  );
}

/** O que cada estado mostra sob o nome (`detail`) e à direita (`trailing`). */
function statusBlock(
  entry: UploadEntry,
  { onPause, onResume, onCancel, onRetry, onDismiss }: Omit<UploadItemProps, "entry">,
): { detail: ReactNode; trailing: ReactNode } {
  const cancel = (
    <ButtonIcon aria-label={`Cancelar envio de ${entry.name}`} onClick={() => onCancel(entry.key)}>
      <X className="size-4" />
    </ButtonIcon>
  );
  switch (entry.status) {
    case "queued":
      return {
        detail: <ProgressBar entry={entry} />,
        trailing: (
          <>
            <span className="text-caption text-ink-muted">Na fila</span>
            {cancel}
          </>
        ),
      };
    case "uploading":
      return {
        detail: <ProgressBar entry={entry} />,
        trailing: (
          <>
            <span className="font-mono text-mono text-ink-muted tabular-nums">
              {entry.progress}%
            </span>
            <ButtonIcon
              aria-label={`Pausar envio de ${entry.name}`}
              onClick={() => onPause(entry.key)}
            >
              <Pause className="size-4" />
            </ButtonIcon>
            {cancel}
          </>
        ),
      };
    case "paused":
      return {
        detail: <ProgressBar entry={entry} />,
        trailing: (
          <>
            <span className="text-caption text-ink-muted">Pausado</span>
            <ButtonIcon
              aria-label={`Retomar envio de ${entry.name}`}
              onClick={() => onResume(entry.key)}
            >
              <Play className="size-4" />
            </ButtonIcon>
            {cancel}
          </>
        ),
      };
    case "done":
      return {
        detail: null,
        trailing: (
          <span
            role="img"
            aria-label="Concluído"
            className="flex size-9 items-center justify-center text-success"
          >
            <CircleCheck className="size-4" />
          </span>
        ),
      };
    case "failed":
      return {
        detail: (
          <>
            <p className="flex items-start gap-1 text-caption text-danger">
              <CircleAlert className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">{entry.message}</span>
            </p>
            {canRetry(entry) && (
              <div className="self-start">
                <ButtonUtility
                  icon={<RotateCw className="size-4" />}
                  onClick={() => onRetry(entry.key)}
                >
                  Tentar de novo
                </ButtonUtility>
              </div>
            )}
          </>
        ),
        trailing: (
          <ButtonIcon
            aria-label={`Remover ${entry.name} do painel`}
            onClick={() => onDismiss(entry.key)}
          >
            <X className="size-4" />
          </ButtonIcon>
        ),
      };
  }
}

/**
 * O `{component.upload-item}`: uma linha do painel de envios, em cada estado do arquivo: na
 * fila, enviando (barra, porcentagem, pausar e cancelar), pausado (retomar e cancelar),
 * concluído e falhou (com "Tentar de novo" quando uma nova tentativa pode dar certo).
 */
export const UploadItem = memo(function UploadItem({ entry, ...actions }: UploadItemProps) {
  const Icon = FILE_KIND_ICONS[fileKind({ type: "file", mimeType: entry.mimeType })];
  const failed = entry.status === "failed";
  const { detail, trailing } = statusBlock(entry, actions);

  return (
    <li className={`flex gap-3 px-4 ${failed ? "items-start py-3" : "h-12 items-center"}`}>
      <span className={`flex w-4 shrink-0 items-center text-ink-muted ${failed ? "h-5" : ""}`}>
        <Icon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-ui text-ink">{entry.name}</span>
        {detail}
      </div>
      <div className="flex shrink-0 items-center gap-1">{trailing}</div>
    </li>
  );
});
