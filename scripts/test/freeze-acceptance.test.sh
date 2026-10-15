#!/usr/bin/env bash
#
# Testes do hook .claude/hooks/freeze-acceptance.sh, pela entrada que o Claude Code entrega a ele
# (um JSON pela entrada padrão) e pela decisão que ele devolve (0 libera, 2 nega). Rodam na máquina,
# como o hook, porque ele usa o `git` e o `jq`, que o contêiner `api` não tem. Quem chama é o
# scripts/verify.sh.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$ROOT/.claude/hooks/freeze-acceptance.sh"
# shellcheck source=sh-helpers.sh
source "$ROOT/scripts/test/sh-helpers.sh"

for tool in git jq; do
  command -v "$tool" >/dev/null || { echo "Falta o \`$tool\` na máquina: o hook e o teste dele precisam dele."; exit 2; }
done

project="$(mktemp -d)"
trap 'rm -rf "$project"' EXIT
git -C "$project" init -q
git -C "$project" config user.email t@t
git -C "$project" config user.name t
mkdir -p "$project/docs/tickets/LUI-1" "$project/apps"
echo congelado >"$project/docs/tickets/LUI-1/aceite.md"
# Outro arquivo da pasta do ticket, em commit só para provar que o congelamento é só do aceite.
echo nota >"$project/docs/tickets/LUI-1/notas.md"
echo x >"$project/apps/a.ts"
git -C "$project" add -A
git -C "$project" -c commit.gpgsign=false -c core.hooksPath=/dev/null commit -q -m plano || exit 2

# O hook roda no projeto temporário.
export CLAUDE_PROJECT_DIR="$project"

# expect <código esperado> <nome> <JSON da entrada> [trecho esperado na saída de erro]
expect() {
  expect_hook "$HOOK" "$@"
}

expect 2 "nega a edição de um arquivo de aceite já versionado, e diz que descongelar é do usuário" \
  "{\"tool_input\":{\"file_path\":\"$project/docs/tickets/LUI-1/aceite.md\"}}" "Descongelar é do usuário"
expect 0 "libera a criação de um arquivo de aceite novo" \
  "{\"tool_input\":{\"file_path\":\"$project/docs/tickets/LUI-2/aceite.md\"}}"
expect 0 "libera a edição de outro arquivo da pasta do ticket, mesmo em commit" \
  "{\"tool_input\":{\"file_path\":\"$project/docs/tickets/LUI-1/notas.md\"}}"
expect 0 "libera a mensagem proposta do plano, na pasta do ticket" \
  "{\"tool_input\":{\"file_path\":\"$project/docs/tickets/LUI-1/plano.msg\"}}"
expect 0 "libera a edição de um arquivo fora da pasta dos tickets" \
  "{\"tool_input\":{\"file_path\":\"$project/apps/a.ts\"}}"
expect 2 "nega o caminho que chega ao arquivo versionado por um \`..\`" \
  "{\"tool_input\":{\"file_path\":\"$project/apps/../docs/tickets/LUI-1/aceite.md\"}}"
expect 2 "nega a entrada ilegível que cita um arquivo de aceite" \
  "isto não é json docs/tickets/LUI-1/aceite.md"
expect 0 "libera a entrada ilegível que cita só outro arquivo da pasta do ticket" \
  "isto não é json docs/tickets/LUI-1/plano.msg"
expect 0 "libera a entrada ilegível que não cita a pasta dos tickets" \
  "isto não é json apps/a.ts"

finish "do hook"
