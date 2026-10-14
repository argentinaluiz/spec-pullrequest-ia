import { HardDrive } from "lucide-react";
import { ROOT_FOLDER_LABEL } from "@/lib/drive";
import { NavItem } from "@/components/navigation/nav-item";

/**
 * O conteúdo do `{component.sidebar}`: a navegação principal do Drive. Hoje só "Meus arquivos";
 * Lixeira, o indicador de Cota e Planos entram com as funcionalidades donas deles.
 */
export function Sidebar() {
  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-1">
      <NavItem
        href="/"
        icon={<HardDrive className="size-5 shrink-0" />}
        label={ROOT_FOLDER_LABEL}
      />
    </nav>
  );
}
