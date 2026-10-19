"use client";

import { Upload } from "lucide-react";
import { useParams } from "next/navigation";
import { useRef } from "react";
import { ButtonPrimary } from "@/components/ui/button-primary";
import { useUploadActions } from "@/components/uploads/upload-provider";

/**
 * O "Enviar" da barra superior: abre o seletor de arquivos (vários, sem o modo de pasta) e entrega os arquivos escolhidos ao
 * provider, para a pasta aberta. Abaixo de `lg` fica só com o ícone.
 */
export function UploadButton() {
  const { send } = useUploadActions();
  const input = useRef<HTMLInputElement>(null);
  // O destino é a pasta aberta (`/pasta/[id]`), ou a Pasta raiz em qualquer outra tela.
  const { id } = useParams<{ id?: string }>();
  const parentId = id ?? "root";

  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        tabIndex={-1}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) send(files, parentId);
          // Sem limpar, escolher o mesmo arquivo de novo não dispara o evento.
          event.target.value = "";
        }}
      />
      <ButtonPrimary
        aria-label="Enviar"
        iconOnlyBelowLg
        onClick={() => input.current?.click()}
      >
        <Upload className="size-5 lg:hidden" />
        <span className="max-lg:hidden">Enviar</span>
      </ButtonPrimary>
    </>
  );
}
