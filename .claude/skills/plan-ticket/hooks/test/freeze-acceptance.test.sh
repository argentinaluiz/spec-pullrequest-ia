#!/usr/bin/env bash
#
# Testes do hook de congelamento do aceite (hooks/freeze-acceptance.sh), pela entrada que o Claude Code entrega
# a ele (um JSON pela entrada padrão) e pela decisão que ele devolve (0 libera, 2 nega). A pasta dos tickets
# chega a ele como argumento da linha de comando. Rodam na máquina, como o hook, porque ele usa o `git` e o
# `jq`, que o contêiner `api` não tem. Os casos de aceite levam o ID no mapa de testes do ticket, e não no nome.

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
HOOK="$HERE/../freeze-acceptance.sh"
# shellcheck source=helpers.sh
source "$HERE/helpers.sh"

for tool in git jq; do
  command -v "$tool" >/dev/null || { echo "Falta o \`$tool\` na máquina: o hook e o teste dele precisam dele."; exit 2; }
done

project="$(mktemp -d)"
trap 'rm -rf "$project"' EXIT
git -C "$project" init -q
git -C "$project" config user.email t@t
git -C "$project" config user.name t
t="docs/tickets/PROJ-100/PROJ-1"
mkdir -p "$project/$t" "$project/apps"
echo congelado >"$project/$t/aceite.md"
# Outro arquivo da pasta do ticket, em commit só para provar que o congelamento é só do aceite.
echo nota >"$project/$t/notas.md"
# Um aceite que ficou no desenho de um nível, de antes da pasta da issue pai.
mkdir -p "$project/docs/tickets/PROJ-7"
echo antigo >"$project/docs/tickets/PROJ-7/aceite.md"
echo x >"$project/apps/a.ts"
git -C "$project" add -A
git -C "$project" -c commit.gpgsign=false -c core.hooksPath=/dev/null commit -q -m plano || exit 2

# O hook roda no projeto temporário, com a pasta dos tickets como argumento.
export CLAUDE_PROJECT_DIR="$project"
HOOK_ARGS=(docs/tickets)

# expect <código esperado> <nome> <JSON da entrada> [trecho esperado na saída de erro]
expect() {
  expect_hook "$HOOK" "$@"
}

expect 2 "nega a edição de um arquivo de aceite já versionado, e diz que descongelar é do usuário" \
  "{\"tool_input\":{\"file_path\":\"$project/$t/aceite.md\"}}" "Descongelar é do usuário"
expect 2 "nega a edição de um aceite versionado no caminho antigo, de um nível, e manda movê-lo para a pasta da issue pai" \
  "{\"tool_input\":{\"file_path\":\"$project/docs/tickets/PROJ-7/aceite.md\"}}" "docs/tickets/<issue>/<ticket>/"
expect 0 "libera a criação de um aceite novo no caminho antigo, de um nível" \
  "{\"tool_input\":{\"file_path\":\"$project/docs/tickets/PROJ-8/aceite.md\"}}"
expect 2 "nega a entrada ilegível que cita um aceite no caminho antigo" \
  "isto não é json docs/tickets/PROJ-7/aceite.md"
expect 0 "libera a criação de um arquivo de aceite novo, na pasta de outro ticket da mesma issue pai" \
  "{\"tool_input\":{\"file_path\":\"$project/docs/tickets/PROJ-100/PROJ-2/aceite.md\"}}"
expect 0 "libera a criação de um arquivo de aceite novo, na pasta de outra issue pai" \
  "{\"tool_input\":{\"file_path\":\"$project/docs/tickets/PROJ-200/PROJ-3/aceite.md\"}}"
expect 0 "libera a edição de outro arquivo da pasta do ticket, mesmo em commit" \
  "{\"tool_input\":{\"file_path\":\"$project/$t/notas.md\"}}"
expect 0 "libera a mensagem proposta do plano, na pasta do ticket" \
  "{\"tool_input\":{\"file_path\":\"$project/$t/plano.msg\"}}"
expect 0 "libera um arquivo da pasta de trabalho sem ticket" \
  "{\"tool_input\":{\"file_path\":\"$project/docs/tickets/sem-ticket/ajuste/review.diff\"}}"
expect 0 "libera a edição de um arquivo fora da pasta dos tickets" \
  "{\"tool_input\":{\"file_path\":\"$project/apps/a.ts\"}}"
expect 2 "nega o caminho que chega ao arquivo versionado por um \`..\`" \
  "{\"tool_input\":{\"file_path\":\"$project/apps/../$t/aceite.md\"}}"
expect 2 "nega a entrada ilegível que cita um arquivo de aceite" \
  "isto não é json $t/aceite.md"
expect 0 "libera a entrada ilegível que cita só outro arquivo da pasta do ticket" \
  "isto não é json $t/plano.msg"
expect 0 "libera a entrada ilegível que não cita a pasta dos tickets" \
  "isto não é json apps/a.ts"

# O mapa de testes do ticket, em commit ou não, é livre: é a parte viva da ligação entre critério e teste.
expect 0 "libera a edição do mapa de testes de um ticket que já tem aceite em commit" \
  "{\"tool_input\":{\"file_path\":\"$project/$t/mapa-de-testes.txt\"}}"

# A pasta dos tickets que o hook recebe: com outra pasta no argumento, o aceite dela fica congelado, e o da
# pasta de antes deixa de estar.
other="planos/PROJ-100/PROJ-1"
mkdir -p "$project/$other"
echo congelado >"$project/$other/aceite.md"
git -C "$project" add -A
git -C "$project" -c commit.gpgsign=false -c core.hooksPath=/dev/null commit -q -m "outra pasta" || exit 2

# hook_code <pasta dos tickets> <arquivo>: o código de saída do hook para a edição do arquivo.
hook_code() {
  jq -n --arg file "$project/$2" '{tool_input: {file_path: $file}}' | "$HOOK" "$1" >/dev/null 2>&1
  echo $?
}

freeze_case() {
  [[ "$(hook_code docs/tickets "$t/aceite.md")" == 2 ]] || return 1
  [[ "$(hook_code docs/tickets "$t/mapa-de-testes.txt")" == 0 ]] || return 1
  [[ "$(hook_code docs/tickets docs/tickets/PROJ-100/PROJ-9/aceite.md)" == 0 ]] || return 1
  [[ "$(hook_code planos "$other/aceite.md")" == 2 ]] || return 1
  [[ "$(hook_code planos "$other/mapa-de-testes.txt")" == 0 ]] || return 1
  [[ "$(hook_code planos "$t/aceite.md")" == 0 ]] || return 1
  [[ "$(hook_code docs/tickets "$other/aceite.md")" == 0 ]]
}
check "nega editar o aceite em commit, libera o mapa de testes e respeita a pasta dos tickets do argumento" freeze_case

finish "do hook"
