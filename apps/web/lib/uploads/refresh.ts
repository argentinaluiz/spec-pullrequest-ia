/**
 * Junta as revalidações pedidas dentro de `delayMs` numa só (docs/lld.md, seção 7.4). O pedido
 * que chega depois de a revalidação sair espera a própria. `dispose` descarta a que estava
 * esperando, quando quem a pediu sai da tela.
 */
export function createRefreshBatcher(refresh: () => void, delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    request() {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        refresh();
      }, delayMs);
    },
    dispose() {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
