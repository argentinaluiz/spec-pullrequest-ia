"use client";

import { Upload } from "lucide-react";
import { useRef } from "react";
import { ButtonPrimary } from "@/components/ui/button-primary";
import { useUploads } from "@/components/uploads/upload-provider";

/**
 * O "Enviar" da barra superior: abre o seletor de arquivos e entrega o arquivo escolhido ao
 * provider. Abaixo de `lg` fica só com o ícone.
 */
export function UploadButton() {
  const { send } = useUploads();
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={input}
        type="file"
        hidden
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) send(file);
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
