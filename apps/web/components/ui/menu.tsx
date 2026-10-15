"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from "react";

/** Quem fecha o menu aberto, para um item que navega ou baixa. */
const CloseMenuContext = createContext<() => void>(() => {});

type MenuProps = {
  /** Nome do botão que abre o menu, para o leitor de tela. */
  label: string;
  /** O que o botão mostra, como a inicial do Usuário no menu da conta. */
  trigger: ReactNode;
  /** Classes do botão que abre o menu: o tamanho e a forma mudam de um menu para outro. */
  triggerClassName: string;
  /**
   * A distância entre o botão e a camada, em classes de margem. O padrão é 4px; o menu da
   * conta a aumenta para a camada abrir 4px abaixo da barra superior, e não do botão.
   */
  offsetClassName?: string;
  /** A largura da camada. O padrão é a do menu da conta (240px); o menu da linha usa 220px. */
  widthClassName?: string;
  /** De que lado do botão a camada se alinha. O padrão é a borda direita; o menu de um botão à esquerda usa `left-0`. */
  alignClassName?: string;
  /** Os itens: `MenuItem`, `MenuLink`, `MenuSeparator` e `MenuHeader`. */
  children: ReactNode;
};

const ITEM_SELECTOR = '[role="menuitem"]:not(:disabled)';

/**
 * O `{component.menu}`: um botão que abre uma camada flutuante com ações. Fecha com Esc, com
 * um clique fora ou com Tab, e as setas passam de um item ao outro.
 */
export function Menu({
  label,
  trigger,
  triggerClassName,
  offsetClassName = "mt-1",
  widthClassName = "w-60 min-w-50",
  alignClassName = "right-0",
  children,
}: MenuProps) {
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
          className={`${offsetClassName} absolute top-full ${alignClassName} z-30 flex ${widthClassName} flex-col rounded-lg border border-hairline bg-surface-raised p-1 shadow-overlay transition-[opacity,translate] duration-200 starting:-translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0`}
        >
          <CloseMenuContext value={() => setOpen(false)}>
            {children}
          </CloseMenuContext>
        </div>
      )}
    </div>
  );
}

/** A classe de todo item do menu, seja botão ou link. */
const ITEM_CLASS_NAME =
  "focus-ring flex h-9 w-full items-center gap-3 rounded-sm px-3 text-ui text-ink outline-none hover:bg-surface-hover focus-visible:bg-surface-hover active:bg-surface-hover";

type ItemContentProps = {
  /**
   * O ícone do Lucide como elemento (`<LogOut />`), e não como componente: um componente não
   * atravessa a fronteira entre servidor e cliente, e o menu é composto também no servidor. O
   * tamanho e a cor saem daqui.
   */
  icon: ReactNode;
  children: ReactNode;
};

/** O ícone de 16px e o rótulo, iguais em `MenuItem` e `MenuLink`. */
function ItemContent({ icon, children }: ItemContentProps) {
  return (
    <>
      <span className="flex shrink-0 text-ink-muted *:size-4">{icon}</span>
      {children}
    </>
  );
}

type MenuItemProps = Omit<
  ComponentProps<"button">,
  "className" | "role" | "children"
> &
  ItemContentProps;

/** Uma ação do menu. Com `type="submit"`, envia o formulário em que está. */
export function MenuItem({
  icon,
  children,
  type = "button",
  ...props
}: MenuItemProps) {
  return (
    <button type={type} role="menuitem" className={ITEM_CLASS_NAME} {...props}>
      <ItemContent icon={icon}>{children}</ItemContent>
    </button>
  );
}

type MenuLinkProps = ItemContentProps & {
  href: string;
  /**
   * Navega pelo app, com um `Link` do Next.js, para a página não recarregar e os envios em
   * andamento seguirem. Sem ela, é um `<a>` comum, para o destino que responde com um download ou
   * um redirecionamento, que a navegação do cliente não trata.
   */
  clientNavigation?: boolean;
};

/**
 * Uma ação do menu que é um link, como "Baixar" ou uma pasta do breadcrumb. O menu fecha ao
 * clicar. Como item de menu, ativa também com Espaço, igual aos botões, e não rola a página.
 */
export function MenuLink({
  icon,
  href,
  clientNavigation = false,
  children,
}: MenuLinkProps) {
  const close = useContext(CloseMenuContext);

  function onKeyDown(event: KeyboardEvent<HTMLAnchorElement>) {
    if (event.key !== " ") return;
    event.preventDefault();
    event.currentTarget.click();
  }

  const Anchor = clientNavigation ? Link : "a";
  return (
    <Anchor
      href={href}
      role="menuitem"
      onClick={close}
      onKeyDown={onKeyDown}
      className={ITEM_CLASS_NAME}
    >
      <ItemContent icon={icon}>{children}</ItemContent>
    </Anchor>
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
