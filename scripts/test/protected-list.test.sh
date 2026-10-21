#!/usr/bin/env bash
#
# Testes do scripts/protected-list.sh, a lista que a Guarda do harness lê neste projeto: a lista de arquivos protegidos
# que o .config/project aponta, seguida dos pontos de convergência como aviso. Rodam na máquina, num repositório
# temporário com uma configuração de mentira.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=../../.claude/skills/plan-ticket/scripts/test/helpers.sh
source "$ROOT/.claude/skills/plan-ticket/scripts/test/helpers.sh"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/.config"
printf 'bloqueado\t.github/**\naviso\tdocs/a.md\n' >"$tmp/.config/lista"

# list: roda o script no repositório temporário e deixa a saída em $out e o código em $code.
list() {
  out="$(cd "$tmp" && "$ROOT/scripts/protected-list.sh" 2>&1)"
  code=$?
}

printf '[tickets]\n\tpasta = planos/\n[protegidos]\n\tlista = .config/lista\n[convergencia]\n\tgerado = api/openapi.json\n\tmigracoes = api/migrations/**\n' \
  >"$tmp/.config/project"
list
in_order() {
  [[ $code -eq 0 ]] &&
    [[ "$out" == *$'bloqueado\t.github/**\naviso\tdocs/a.md'*$'congelado\tplanos/*/*/aceite.md\naviso\tplanos/*/*/mapa-de-testes.*'*$'aviso\tapi/openapi.json\naviso\tapi/migrations/**' ]]
}
check "imprime a lista, os aceites da pasta dos tickets como congelado e os mapas e cada ponto de convergência como aviso" in_order

printf '[tickets]\n\tpasta = planos\n[protegidos]\n\tlista = .config/lista\n' >"$tmp/.config/project"
list
check "sem pontos de convergência, imprime só a lista e os arquivos da pasta dos tickets" bash -c '[[ $1 -eq 0 && $2 == *"docs/a.md"* && $2 != *"api/"* ]]' _ "$code" "$out"

printf '[convergencia]\n\tgerado = api/openapi.json\n' >"$tmp/.config/project"
list
check "sem a chave da lista, sai com 2 e diz qual chave falta" bash -c '[[ $1 -eq 2 && $2 == *"protegidos.lista"* ]]' _ "$code" "$out"

printf '[protegidos]\n\tlista = .config/nao-existe\n' >"$tmp/.config/project"
list
check "com uma lista que não existe, sai com 2 e diz qual" bash -c '[[ $1 -eq 2 && $2 == *".config/nao-existe"* ]]' _ "$code" "$out"

printf '[protegidos]\n\tlista = .config/lista\n' >"$tmp/.config/project"
list
check "sem a pasta dos tickets, sai com 2 e diz qual chave falta" bash -c '[[ $1 -eq 2 && $2 == *"tickets.pasta"* ]]' _ "$code" "$out"

printf '[tickets]\n\tpasta = planos\n[protegidos]\n\tlista = .config/lista\n[convergencia]\n\tmanual =\n' >"$tmp/.config/project"
list
check "um ponto de convergência sem padrão sai com 2 e nomeia a chave" bash -c '[[ $1 -eq 2 && $2 == *"convergencia.manual"* ]]' _ "$code" "$out"

finish "da lista que a Guarda lê"
