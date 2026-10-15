import { NextResponse } from "next/server";
import { getDownloadUrl } from "@/lib/dal/items";

/**
 * O caminho que a lista põe no link "Baixar" (docs/lld.md, seção 7.5). A URL assinada do
 * storage vence em 5 minutos e nunca entra no HTML: esta rota a pede à API no momento do
 * clique e responde `302` para ela, e os bytes vão direto do storage ao navegador. Sem Sessão,
 * o Proxy leva à tela de entrar antes de chegar aqui.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/arquivos/[id]/baixar">,
) {
  const { id } = await params;
  const result = await getDownloadUrl(id);

  if (!result.ok) {
    // Um erro da API não encerra a Sessão: só o `unauthenticated`, que `withSession` já tratou.
    // O link sai da lista para esta resposta, e a frase evita uma página em branco.
    const notFound = result.error.code === "not_found";
    return new NextResponse(
      notFound
        ? "Arquivo não encontrado."
        : "Não deu para baixar o arquivo agora. Tente de novo.",
      {
        status: notFound ? 404 : 502,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "private, no-store",
        },
      },
    );
  }

  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: result.data.url,
      "Cache-Control": "private, no-store",
    },
  });
}
