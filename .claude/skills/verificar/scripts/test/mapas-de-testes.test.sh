#!/usr/bin/env bash
#
# Teste dos mapas de testes do repositório (docs/tickets/<pai>/<ticket>/mapa-de-testes.txt, formato da skill
# plan-ticket): cada linha liga um critério a um caso de um teste de skill, que não pode levar ID de critério deste
# projeto. O teste confere que cada linha de cada mapa tem o ID num arquivo de aceite e o nome do caso no arquivo
# de teste dela; que nenhum teste da skill de plano nem da skill worktree traz um ID deste projeto; e que o conferidor do aceite, com um
# relatório montado das linhas dos mapas, cobre cada critério ligado, sem tag nenhuma no relatório. Roda na máquina,
# como o executor, e chama o conferidor no contêiner `api`. O caso leva a tag do critério de aceite no nome.

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../../.." && pwd)"
# shellcheck source=sh-helpers.sh
source "$HERE/sh-helpers.sh"

command -v jq >/dev/null || { echo "Falta o \`jq\` na máquina: o teste dos mapas precisa dele."; exit 2; }

cd "$ROOT" || exit 2
CHECKER=.claude/skills/plan-ticket/scripts/check-acceptance.cjs
TICKETS=docs/tickets

mkdir -p apps/api/reports
work="$(mktemp -d -p apps/api/reports mapas.XXXXXX)"
trap 'rm -rf "$work"' EXIT
# O conferidor lê o relatório no contêiner, que pode ter outro usuário.
chmod 755 "$work"

# Os mapas do repositório, e as ligações de todos: ID, arquivo e nome do caso, uma por linha, com tabulação.
shopt -s nullglob
maps=("$TICKETS"/*/*/mapa-de-testes.txt)
links="$work/ligacoes.tsv"
: >"$links"
for map in "${maps[@]}"; do
  grep -vE '^(#|[[:space:]]*$)' "$map" >>"$links"
done

# Cada linha: o ID está num arquivo de aceite, o arquivo de teste existe e traz o nome do caso.
links_are_real() {
  [[ -s "$links" ]] || return 1
  local id file name
  while IFS=$'\t' read -r id file name; do
    grep -rqxF -- "## $id" "$TICKETS" --include=aceite.md || { echo "o ID $id não está em nenhum aceite"; return 1; }
    [[ -f "$file" ]] || { echo "o arquivo $file do mapa não existe"; return 1; }
    grep -qF -- "$name" "$file" || { echo "o caso \"$name\" não está em $file"; return 1; }
  done <"$links"
}

# Um teste de skill de uso geral não traz o ID de um critério deste projeto: os IDs de fixture (PROJ-*) valem.
skill_tests_have_no_project_ids() {
  local found
  found="$(grep -rhoE '@[A-Z][A-Z0-9]*-[0-9]+-CA[0-9]+' .claude/skills/plan-ticket/scripts/test .claude/skills/plan-ticket/hooks/test \
    .claude/skills/worktree/scripts/test .claude/skills/worktree/hooks/test |
    grep -v '^@PROJ-' || true)"
  [[ -z "$found" ]] || { echo "ID deste projeto em teste da skill: $found"; return 1; }
}

# O relatório montado das linhas dos mapas, no formato do Vitest, sem nenhuma tag: o conferidor tem de cobrir
# cada ID ligado só pelo mapa.
covered_by_the_maps() {
  [[ -s "$links" ]] || return 1
  jq -R -s '
    [split("\n")[] | select(length > 0) | split("\t")] as $links
    | {testResults: [ $links | group_by(.[1])[] | {
        name: ("/repo/" + .[0][1]),
        assertionResults: [ .[] | {title: .[2], fullName: .[2], ancestorTitles: [], tags: [], status: "passed"} ]
      } ]}' "$links" >"$work/relatorio.json" || return 1
  local out id
  out="$(scripts/node-in-api.sh "$CHECKER" --optional - "$TICKETS" "vitest:/repo/${work}/relatorio.json" 2>&1 </dev/null)"
  while IFS= read -r id; do
    [[ "$out" == *"$id: coberto por"* ]] || { echo "o ID $id não saiu coberto pelo mapa"; return 1; }
  done < <(cut -f1 "$links" | sort -u)
  [[ "$out" != *"não aparece no relatório"* && "$out" != *"que não está em nenhum arquivo de aceite"* ]]
}

name="os critérios provados pelos testes do conferidor continuam cobertos pelo mapa, sem ID deste projeto nos testes da skill @LUI-196-CA7 @LUI-199-CA7"
check "$name: os mapas existem e cada linha liga um critério a um caso que está no arquivo" links_are_real
check "$name: nenhum teste da skill de plano nem da skill worktree traz o ID de um critério deste projeto" skill_tests_have_no_project_ids
check "$name: o conferidor cobre cada critério ligado só pelo mapa" covered_by_the_maps

finish "dos mapas de testes"
