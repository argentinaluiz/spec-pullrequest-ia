import type { ComponentProps } from "react";

type ButtonSecondaryProps = Omit<ComponentProps<"button">, "className">;

/**
 * O `{component.button-secondary}`: a segunda ação, ao lado do primário ("Cancelar"). Mesmo
 * tamanho e forma do `button-primary`, com a borda e o texto em `{colors.primary}`.
 */
export function ButtonSecondary({ type = "button", ...props }: ButtonSecondaryProps) {
  return (
    <button
      type={type}
      className="focus-ring inline-flex h-11 items-center justify-center rounded-pill border border-primary px-5.5 text-ui-strong whitespace-nowrap text-primary transition-[background-color,scale] duration-150 not-disabled:hover:bg-surface-hover not-disabled:active:scale-95 motion-reduce:not-disabled:active:scale-100 disabled:border-hairline disabled:text-ink-disabled"
      {...props}
    />
  );
}
