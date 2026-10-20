#!/usr/bin/env bash
#
# Hook de antes da edição do Claude Code (evento PreToolUse, ferramentas de edição de arquivo).
# O arquivo de aceite de um ticket fica congelado depois do commit de plano: quando o agente vai
# editar um <pasta dos tickets>/<issue>/<ticket>/aceite.md que já está em commit, nega a edição. Criar um arquivo
# de aceite novo e editar qualquer outro arquivo, inclusive os outros da pasta do ticket (o mapa de testes é
# um deles), continuam liberados.
#
#   freeze-acceptance.sh [<pasta dos tickets>]
#
# A pasta dos tickets, relativa à raiz do projeto, é do projeto, e chega pela linha de comando do hook; sem ela, vale
# `docs/tickets`, o padrão da skill de plano.
#
# Sai com 0 para deixar a edição rodar e com 2 para negá-la. No 2, o que foi escrito na saída de
# erro volta para o agente.

set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../../../..}" || exit 0

# A pasta dos tickets na forma do caminho que o `realpath` devolve abaixo: relativa à raiz do projeto, sem `./`,
# sem barras repetidas e sem barra no fim. Um caminho absoluto dentro do projeto vira relativo. Sem forks: o hook
# roda a cada edição.
tickets="${1:-docs/tickets}"
tickets="${tickets#"$PWD"/}"
tickets="${tickets//\/.\//\/}"
tickets="${tickets#./}"
while [[ "$tickets" == *//* ]]; do tickets="${tickets//\/\//\/}"; done
tickets="${tickets%/}"

# O hook recebe um JSON pela entrada padrão, com o arquivo em `tool_input.file_path` (ou em
# `tool_input.notebook_path`, no NotebookEdit).
input="$(cat)"

# O que vem depois da pasta dos tickets num caminho relativo à raiz do projeto: um arquivo de aceite de um ticket é
# `<issue>/<ticket>/aceite.md`, e o de antes da pasta da issue pai, de um nível só, é `<ticket>/aceite.md`.
ACCEPTANCE='^[^/]+/[^/]+/aceite\.md$'
OLD_ACCEPTANCE='^[^/]+/aceite\.md$'

# Se um texto cita um arquivo de aceite, de qualquer um dos dois desenhos, em qualquer ponto: é para a entrada que
# o hook não consegue ler. O `sed` escapa a pasta dos tickets como texto literal da expressão, e só roda aqui, no
# caso raro.
mentions_acceptance() {
  local literal
  literal="$(printf '%s' "$tickets" | sed 's/[][\.*^$+?(){}|/]/\\&/g')"
  [[ "$1" =~ $literal/[^/[:space:]\"]+/[^/[:space:]\"]+/aceite\.md || "$1" =~ $literal/[^/[:space:]\"]+/aceite\.md ]]
}

deny() {
  {
    echo "A edição foi negada: $1 está congelado desde o commit de plano."
    echo "Descongelar é do usuário, no editor ou no terminal. Não contorne o bloqueio: se o critério mudou de verdade, peça ao usuário que edite o arquivo de aceite."
  } >&2
  exit 2
}

file="$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input" 2>/dev/null)" || file=""

# Sem conseguir ler o arquivo, qualquer menção a um arquivo de aceite conta como edição de aceite
# versionado, para a falha do `jq` não liberar a edição.
if [[ -z "$file" ]]; then
  mentions_acceptance "$input" && deny "o arquivo de aceite citado na entrada"
  exit 0
fi

# O caminho a partir da raiz do projeto, sem `..` nem caminho absoluto.
# Se o caminho não pode ser normalizado, vale a mesma regra da entrada ilegível.
relative="$(realpath -m --relative-to="$PWD" -- "$file" 2>/dev/null)" || {
  mentions_acceptance "$file" && deny "o arquivo de aceite citado na entrada"
  exit 0
}
# Fora da pasta dos tickets, o hook não tem o que congelar.
inside="${relative#"$tickets"/}"
[[ "$inside" != "$relative" ]] || exit 0
if [[ "$inside" =~ $OLD_ACCEPTANCE ]]; then
  git cat-file -e "HEAD:$relative" 2>/dev/null &&
    deny "$relative, no caminho antigo (mova-o para $tickets/<issue>/<ticket>/, com um commit do usuário)"
  exit 0
fi
[[ "$inside" =~ $ACCEPTANCE ]] || exit 0

# Só o que já está em commit está congelado: o arquivo novo do plano em andamento é liberado.
git cat-file -e "HEAD:$relative" 2>/dev/null && deny "$relative"
exit 0
