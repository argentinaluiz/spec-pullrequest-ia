#!/usr/bin/env bash
#
# A visão legível do contrato e do schema entre dois pontos do Git, em Markdown. É o comando do contrato deste projeto para a
# skill de plano (o AGENTS.md da raiz o declara em "Valores das skills do ticket"), que lê as seções `# Contrato` e `# Schema`.
#
#   contract-view.sh [<de> [<para>]]
#
# Entrada: dois pontos do Git, que são commits (uma branch e uma tag também) ou o id de uma árvore da raiz, como o que o
# `git write-tree` imprime para o índice; sem <para>, o segundo é a pasta de trabalho, e sem nenhum, o primeiro é o `HEAD`.
# Saída (a padrão): uma linha com os dois pontos, e então as duas seções: o changelog do oasdiff, o contrato completo de cada
# rota nova ou alterada, e o diff do schema do Prisma. Precisa do contêiner `api` no ar (o Node roda nele) e do `docker` (o
# oasdiff). Roda de qualquer pasta: vai para a raiz do repositório.
#
# Sai com 0 se montou a visão, 1 se não deu para montá-la (um snapshot ilegível, o erro vem antes) e 2 no uso errado, num
# ponto que não existe ou com o contêiner fora do ar.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 2
# shellcheck source=contract-lib.sh
source scripts/contract-lib.sh

abort() {
  printf '\nNÃO MONTADO: %s\n' "$1" >&2
  printf 'Como resolver: %s\n' "$2" >&2
  exit 2
}

# Um ponto: um commit, ou o id de uma árvore da raiz. Uma subárvore (`<commit>:<caminho>`) não vale: os caminhos do snapshot e
# do schema são lidos a partir da raiz.
require_point() {
  git rev-parse --verify --quiet "$1^{commit}" >/dev/null 2>&1 && return 0
  [[ "$1" =~ ^[0-9a-f]{4,64}$ && "$(git cat-file -t "$1" 2>/dev/null)" == tree ]] ||
    abort "\`$1\` não é um commit nem o id da árvore da raiz deste repositório." \
      "passe um commit, uma branch ou uma tag existente, como \`HEAD\` ou \`origin/main\`, ou o id que o \`git write-tree\` imprime."
}

[[ $# -le 2 ]] || abort "o comando recebe até dois pontos do Git, e vieram $#." "use \`contract-view.sh [<de> [<para>]]\`."
from="${1:-HEAD}"
to="${2:-}"
require_point "$from"
[[ -z "$to" ]] || require_point "$to"

docker compose -f compose.dev.yaml exec -T api true >/dev/null 2>&1 </dev/null ||
  abort "o contêiner \`api\` não está no ar." \
    "suba o ambiente com \`docker compose -f compose.dev.yaml up -d --build --wait\` e rode de novo."

contract_view "$from" "$to" || {
  printf '\nA visão do contrato não pôde ser montada: o erro está acima.\n' >&2
  printf 'Como corrigir: corrija o que ele aponta (num snapshot ilegível, o JSON de %s, no ponto que o oasdiff mostra) e rode o comando de novo.\n' "$API_SNAPSHOT" >&2
  exit 1
}
