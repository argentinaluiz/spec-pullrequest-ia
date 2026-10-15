import { ChevronRight, Ellipsis, Folder } from "lucide-react";
import Link from "next/link";
import { buttonIconClassName } from "@/components/ui/button-icon";
import { Menu, MenuLink } from "@/components/ui/menu";
import type { ItemTrailEntry } from "@/lib/api/types";
import { folderPath } from "@/lib/drive";

const SEGMENT_CLASS_NAME =
  "focus-ring truncate rounded-sm text-ui text-ink-muted hover:text-ink hover:underline";

function Separator() {
  return <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />;
}

/**
 * O `{component.breadcrumb}`: o caminho da pasta atual, no topo da área de conteúdo. Cada trecho
 * é um link, e o último, a pasta aberta, é o título da página. A partir de `sm` mostra o caminho
 * inteiro; abaixo disso, com mais de dois trechos, os do meio colapsam em "…", que abre um menu
 * com essas pastas. O primeiro trecho é a Pasta raiz, que é a página inicial.
 */
export function Breadcrumb({ trail }: { trail: ItemTrailEntry[] }) {
  const hrefs = trail.map((entry, index) => (index === 0 ? "/" : folderPath(entry.id)));
  const current = trail[trail.length - 1];
  const collapsible = trail.length > 2;

  return (
    <nav aria-label="Caminho" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1">
        {trail.slice(0, -1).map((entry, index) => (
          <li
            key={entry.id}
            // Os do meio ficam escondidos no celular, onde o menu "…" os traz.
            className={`flex min-w-0 items-center gap-1 ${
              collapsible && index > 0 ? "max-sm:hidden" : ""
            }`}
          >
            <Link href={hrefs[index]} className={SEGMENT_CLASS_NAME}>
              {entry.name}
            </Link>
            <Separator />
          </li>
        ))}
        {collapsible && (
          <li className="flex items-center gap-1 sm:hidden">
            <Menu
              label="Pastas do caminho"
              alignClassName="left-0"
              widthClassName="w-60 min-w-50"
              triggerClassName={buttonIconClassName(44)}
              trigger={<Ellipsis className="size-5" />}
            >
              {trail.slice(1, -1).map((entry, index) => (
                <MenuLink
                  key={entry.id}
                  clientNavigation
                  icon={<Folder />}
                  href={hrefs[index + 1]}
                >
                  {entry.name}
                </MenuLink>
              ))}
            </Menu>
            <Separator />
          </li>
        )}
        <li className="min-w-0">
          <h1 aria-current="page" className="truncate px-2 text-ui-strong text-ink">
            {current.name}
          </h1>
        </li>
      </ol>
    </nav>
  );
}
