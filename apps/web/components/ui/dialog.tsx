"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

type DialogProps = {
  title: string;
  /** Chamado quando a pessoa fecha o diálogo (Esc ou clique no véu). Quem o monta o desmonta. */
  onClose: () => void;
  /** O conteúdo: o corpo e os botões do rodapé, com o padding de `{spacing.lg}`. */
  children: ReactNode;
};

/**
 * O `{component.dialog}`: janela modal sobre o véu, aberta assim que é montada. O `<dialog>` modal
 * prende o foco e esconde o resto da página do leitor de tela. Abaixo de `sm` ocupa a largura
 * toda, com margem de 16px.
 */
export function Dialog({ title, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // O clique só fecha se também começou no véu: arrastar uma seleção de dentro para fora não fecha.
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      // O clique no véu cai no próprio `<dialog>`, e não no conteúdo dele.
      onMouseDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressedOnBackdrop.current && event.target === event.currentTarget) {
          onClose();
        }
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-120 rounded-lg bg-surface-raised p-0 text-ink shadow-overlay transition-[opacity,translate] duration-200 backdrop:bg-scrim starting:open:translate-y-1 starting:open:opacity-0 motion-reduce:starting:open:translate-y-0 sm:w-full"
    >
      <div className="flex flex-col gap-4 p-6">
        <h2 id={titleId} className="text-title text-ink">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}
