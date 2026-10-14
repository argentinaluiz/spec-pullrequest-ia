import type { ReactNode } from "react";

type AppBarProps = {
  /** O botão que abre a navegação em gaveta, só abaixo de `lg`. */
  navigation: ReactNode;
  /** O `{component.account-menu}`. */
  account: ReactNode;
};

/**
 * A `{component.app-bar}`: a barra superior fixa do Drive. Hoje traz só a marca e o menu da
 * conta; a busca e o "Enviar" entram com as funcionalidades donas deles.
 */
export function AppBar({ navigation, account }: AppBarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-1 border-b border-hairline bg-canvas/80 px-4 backdrop-blur-[20px] lg:justify-between lg:gap-4">
      {navigation}
      {/* A marca do produto, um marcador de texto até a identidade existir. */}
      <p className="min-w-0 flex-1 truncate text-body-strong text-ink lg:flex-none">
        Gerenciador de arquivos
      </p>
      {account}
    </header>
  );
}
