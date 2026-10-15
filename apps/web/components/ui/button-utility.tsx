import { LoaderCircle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

type ButtonUtilityProps = Omit<ComponentProps<"button">, "className"> & {
  /** O ícone do Lucide, em 16px, à esquerda do rótulo. */
  icon?: ReactNode;
  /** Mostra o spinner no lugar do conteúdo, sem mudar a largura, e bloqueia o clique. */
  loading?: boolean;
};

/**
 * O `{component.button-utility}`: ações de barra de ferramentas e o "Carregar mais". Tem 36px
 * no desktop e sobe para 44px abaixo de `lg`, onde há toque.
 */
export function ButtonUtility({
  icon,
  loading = false,
  disabled,
  children,
  type = "button",
  ...props
}: ButtonUtilityProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className="focus-ring relative inline-flex h-11 shrink-0 items-center justify-center rounded-sm px-3.5 text-ui-strong whitespace-nowrap text-ink transition-[background-color,scale] duration-150 not-disabled:hover:bg-surface-hover not-disabled:active:scale-95 motion-reduce:not-disabled:active:scale-100 disabled:not-aria-busy:text-ink-disabled lg:h-9"
      {...props}
    >
      <span
        className={`inline-flex items-center gap-2 ${loading ? "invisible" : ""}`}
      >
        {icon}
        {children}
      </span>
      {loading && (
        <LoaderCircle className="absolute size-4 animate-spin motion-reduce:animate-none" />
      )}
    </button>
  );
}
