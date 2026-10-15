"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavItemProps = {
  href: "/";
  /** O ícone do Lucide, já renderizado: um componente não atravessa para o cliente. */
  icon: ReactNode;
  label: string;
};

/**
 * O `{component.nav-item}`. Fica ativo na página do próprio destino, com `aria-current`, que é
 * como o leitor de tela sabe onde a pessoa está.
 */
export function NavItem({ href, icon, label }: NavItemProps) {
  const active = usePathname() === href;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="focus-ring flex h-10 items-center gap-3 rounded-sm px-3 text-ui text-ink transition-colors duration-150 hover:bg-surface-hover aria-[current=page]:bg-primary-soft aria-[current=page]:text-ui-strong aria-[current=page]:text-primary"
    >
      {icon}
      {label}
    </Link>
  );
}
