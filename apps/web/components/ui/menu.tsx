"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { LucideIcon } from "lucide-react";

type MenuProps = {
  /** Nome do botão que abre o menu, para o leitor de tela. */
  label: string;
  /** O que o botão mostra, como a inicial do Usuário no menu da conta. */
  trigger: ReactNode;
  /** Classes do botão que abre o menu: o tamanho e a forma mudam de um menu para outro. */
  triggerClassName: string;
  /** Os itens: `MenuItem`, `MenuSeparator` e `MenuHeader`. */
  children: ReactNode;
};

const ITEM_SELECTOR = '[role="menuitem"]:not(:disabled)';

/**
 * O `{component.menu}`: um botão que abre uma camada flutuante com ações. Fecha com Esc, com
 * um clique fora ou com Tab, e as setas passam de um item ao outro.
 */
export function Menu({ label, trigger, triggerClassName, children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus();
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? [],
    );
    const current = items.indexOf(document.activeElement as HTMLElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next =
      current === -1
        ? step > 0
          ? 0
          : items.length - 1
        : (current + step + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute top-full right-0 z-30 mt-1 flex w-60 min-w-50 flex-col rounded-lg border border-hairline bg-surface-raised p-1 shadow-overlay transition-[opacity,translate] duration-200 starting:-translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0"
        >
          {children}
        </div>
      )}
    </div>
  );
}

type MenuItemProps = Omit<
  ComponentProps<"button">,
  "className" | "role" | "children"
> & {
  icon: LucideIcon;
  children: ReactNode;
};

/** Uma ação do menu. Com `type="submit"`, envia o formulário em que está. */
export function MenuItem({
  icon: Icon,
  children,
  type = "button",
  ...props
}: MenuItemProps) {
  return (
    <button
      type={type}
      role="menuitem"
      className="focus-ring flex h-9 w-full items-center gap-3 rounded-sm px-3 text-ui text-ink outline-none hover:bg-surface-hover focus-visible:bg-surface-hover active:bg-surface-hover"
      {...props}
    >
      <Icon className="size-4 shrink-0 text-ink-muted" />
      {children}
    </button>
  );
}

/** A linha fina entre grupos de itens. */
export function MenuSeparator() {
  return (
    <div role="separator" className="py-1">
      <div className="h-px bg-hairline" />
    </div>
  );
}

/** Texto do topo do menu, que não é uma ação, como o e-mail no menu da conta. */
export function MenuHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-3 py-2">{children}</div>
  );
}
