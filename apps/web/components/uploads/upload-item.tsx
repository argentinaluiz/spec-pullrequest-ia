import { CircleAlert, CircleCheck, X } from "lucide-react";
import { FILE_KIND_ICONS } from "@/components/files/file-row";
import { fileKind } from "@/components/files/format";
import type { UploadEntry } from "@/components/uploads/types";
import { ButtonIcon } from "@/components/ui/button-icon";

type UploadItemProps = {
  entry: UploadEntry;
  /** Tira o item do painel. Só os envios que terminaram ou falharam o oferecem. */
  onDismiss: () => void;
};

/**
 * O `{component.upload-item}`: uma linha do painel de envios. Hoje mostra o envio de um único
 * `PUT`: enviando (barra e porcentagem), concluído e falhou. Pausar, retomar e tentar de novo
 * entram com os arquivos grandes.
 */
export function UploadItem({ entry, onDismiss }: UploadItemProps) {
  const Icon = FILE_KIND_ICONS[fileKind({ type: "file", mimeType: entry.mimeType })];

  return (
    <li
      className={`flex gap-3 px-4 ${entry.status === "failed" ? "items-start py-3" : "h-12 items-center"}`}
    >
      <span
        className={`flex w-4 shrink-0 items-center text-ink-muted ${entry.status === "failed" ? "h-5" : ""}`}
      >
        <Icon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-ui text-ink">{entry.name}</span>
        {entry.status === "uploading" && (
          <div
            role="progressbar"
            aria-label={`Envio de ${entry.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={entry.progress}
            className="mt-1 h-0.5 w-full overflow-hidden bg-hairline"
          >
            <div
              className="h-full bg-primary"
              style={{ width: `${entry.progress}%` }}
            />
          </div>
        )}
        {entry.status === "failed" && (
          <p className="flex items-start gap-1 text-caption text-danger">
            <CircleAlert className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">{entry.message}</span>
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {entry.status === "uploading" && (
          <span className="font-mono text-mono text-ink-muted tabular-nums">
            {entry.progress}%
          </span>
        )}
        {entry.status === "done" && (
          <span
            role="img"
            aria-label="Concluído"
            className="flex size-9 items-center justify-center text-success"
          >
            <CircleCheck className="size-4" />
          </span>
        )}
        {entry.status === "failed" && (
          <ButtonIcon aria-label={`Remover ${entry.name} do painel`} onClick={onDismiss}>
            <X className="size-4" />
          </ButtonIcon>
        )}
      </div>
    </li>
  );
}
