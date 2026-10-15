"use client";

import { CloudUpload } from "lucide-react";
import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { useUploadActions } from "@/components/uploads/upload-provider";

/** Só o que traz arquivos vira envio: arrastar um texto ou um link não acende a zona. */
function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer.types.includes("Files");
}

/**
 * Separa o que foi solto em arquivos e pastas. Tem de rodar dentro do evento de soltar: depois
 * dele, o navegador esvazia o `DataTransfer`. Pasta é o que `webkitGetAsEntry()` diz ser diretório.
 */
function readDropped(transfer: DataTransfer): {
  files: File[];
  folderDropped: boolean;
} {
  const files: File[] = [];
  let folderDropped = false;
  for (const item of Array.from(transfer.items)) {
    if (item.kind !== "file") continue;
    if (item.webkitGetAsEntry?.()?.isDirectory) {
      folderDropped = true;
      continue;
    }
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return { files, folderDropped };
}

type DropzoneProps = {
  /** O nome da pasta de destino, que a zona mostra. */
  folderName: string;
  /** `root` ou o id da pasta de destino. */
  parentId: string;
  /** A lista da pasta, que é a zona de soltar. */
  children: ReactNode;
};

/**
 * O `{component.dropzone}`: a lista da pasta atual é a zona de soltar (docs/lld.md, seção 7.4).
 * Enquanto a pessoa arrasta arquivos sobre ela, a zona a cobre com o nome da pasta de destino.
 * Os arquivos soltos entram na fila de envios; uma pasta solta não é enviada, e o painel avisa.
 */
export function Dropzone({ folderName, parentId, children }: DropzoneProps) {
  const { send, notifyFolderDropped } = useUploadActions();
  const [dragging, setDragging] = useState(false);
  // `dragenter` e `dragleave` disparam também ao passar de um elemento a outro dentro da zona:
  // a contagem diz quando o arrasto saiu dela de fato.
  const depth = useRef(0);

  return (
    <div
      className="relative flex min-w-0 flex-1 flex-col"
      onDragEnter={(event) => {
        if (!carriesFiles(event)) return;
        depth.current += 1;
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!carriesFiles(event)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDragOver={(event) => {
        // Sem isto, o navegador não aceita a soltura e abre o arquivo na aba.
        if (carriesFiles(event)) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        depth.current = 0;
        setDragging(false);
        const { files, folderDropped } = readDropped(event.dataTransfer);
        if (folderDropped) notifyFolderDropped();
        send(files, parentId);
      }}
    >
      {children}
      {dragging && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-primary bg-primary-soft"
        >
          <CloudUpload className="size-10 text-primary" />
          <p className="text-title text-ink">Enviar para {folderName}</p>
        </div>
      )}
    </div>
  );
}
