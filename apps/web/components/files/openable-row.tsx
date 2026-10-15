"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

type OpenableRowProps = {
  /** Para onde a linha leva: a pasta que ela representa. */
  href: string;
  className: string;
  /** As células da linha, já renderizadas no servidor. */
  children: ReactNode;
};

/**
 * A linha de uma pasta, que a abre com dois cliques (docs/design-system.md, `file-row`) ou com
 * Enter, para quem usa o teclado. A navegação é a do app, e não um recarregamento, para os
 * envios em andamento seguirem.
 */
export function OpenableRow({ href, className, children }: OpenableRowProps) {
  const router = useRouter();
  return (
    <div
      role="row"
      tabIndex={0}
      onDoubleClick={() => router.push(href)}
      onKeyDown={(event) => {
        // Enter num botão de dentro da linha é do botão, e não abre a pasta.
        if (event.key === "Enter" && event.target === event.currentTarget) {
          router.push(href);
        }
      }}
      className={`${className} focus-ring cursor-default select-none hover:bg-surface-hover`}
    >
      {children}
    </div>
  );
}
