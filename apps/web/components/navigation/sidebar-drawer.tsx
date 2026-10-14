"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { ButtonIcon } from "@/components/ui/button-icon";

/**
 * O `{component.sidebar}` abaixo de `lg`: o botão de menu da barra superior abre a navegação
 * numa gaveta que desliza da esquerda sobre o véu. Fecha com Esc, com um clique no véu e ao
 * navegar. O `<dialog>` modal prende o foco e esconde o resto da página do leitor de tela.
 */
export function SidebarDrawer({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  return (
    <>
      <div className="lg:hidden">
        <ButtonIcon
          size={44}
          aria-label="Abrir navegação"
          onClick={() => dialogRef.current?.showModal()}
        >
          <Menu className="size-5" />
        </ButtonIcon>
      </div>
      <dialog
        ref={dialogRef}
        aria-label="Navegação"
        // O clique no véu cai no próprio `<dialog>`, e não no conteúdo dele.
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="m-0 h-dvh max-h-none w-60 max-w-none bg-surface p-3 text-ink transition-[translate] duration-200 backdrop:bg-scrim starting:open:-translate-x-full motion-reduce:transition-none lg:hidden"
      >
        {children}
      </dialog>
    </>
  );
}
