/**
 * A identidade da primeira página que o servidor desenhou: os ids, na ordem, e o cursor. Quando
 * ela muda (um envio terminou e a lista foi revalidada), as páginas acrescentadas no cliente
 * ficam velhas e a lista recomeça da primeira página nova. Enquanto não muda, o Usuário não
 * perde o que já carregou.
 */
export function firstPageKey(ids: string[], nextCursor: string | null): string {
  return JSON.stringify([ids, nextCursor]);
}
