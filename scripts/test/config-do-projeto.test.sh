#!/usr/bin/env bash
#
# Teste do arquivo de configuração deste projeto (.config/project): ele declara os valores de que as skills do kit
# precisam, e os comandos e os arquivos que ele nomeia existem. Uma chave que sumiu, ou um caminho que ficou velho
# depois de um renomear, reprova aqui, e não só quando uma skill tenta usá-lo. Roda na máquina.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=../../.claude/skills/verificar/scripts/test/sh-helpers.sh
source "$ROOT/.claude/skills/verificar/scripts/test/sh-helpers.sh"

CONFIG="$ROOT/.config/project"

# get <chave>: o valor da chave no arquivo, ou nada.
get() {
  git config --file "$CONFIG" --get "$1"
}

check "o arquivo de configuração se lê como arquivo de configuração do Git" git config --file "$CONFIG" --list

declared() {
  local key
  for key in tickets.pasta tickets.documentos node.comando contrato.comando contrato.arquivos contrato.desvio \
    plano.atalho revisao.base revisao.sempre revisao.com-aceite verificacao.completa frentes.limite frentes.ambiente; do
    [[ -n "$(get "$key")" ]] || { echo "falta a chave $key" >&2; return 1; }
  done
}
check "o arquivo declara os valores de que as skills do kit precisam" declared

commands_exist() {
  local key path
  for key in node.comando contrato.comando contrato.desvio frentes.ambiente; do
    path="$(get "$key")"
    [[ -x "$ROOT/$path" ]] || { echo "$key aponta para $path, que não é um arquivo executável" >&2; return 1; }
  done
}
check "os comandos que o arquivo nomeia existem e são executáveis" commands_exist

files_exist() {
  local path
  for path in $(get contrato.arquivos) "$(get tickets.pasta)" "$(get tickets.documentos)"; do
    [[ -e "$ROOT/$path" ]] || { echo "$path não existe" >&2; return 1; }
  done
}
check "os arquivos e as pastas que o arquivo nomeia existem" files_exist

shortcut_exists() {
  local command
  command="$(get plano.atalho)"
  # O atalho é um comando com argumentos: o primeiro item é o executável.
  [[ -x "$ROOT/${command%% *}" ]]
}
check "o atalho da página do plano nomeia um executável que existe" shortcut_exists

# O arquivo é o dono único: o que o resto do harness ainda escreve por conta própria tem de bater com ele.
VERIFY="$ROOT/.claude/skills/verificar/scripts/verify.sh"

# value_of <arquivo> <variável>: o valor atribuído a `NOME=valor` numa linha do arquivo.
value_of() {
  sed -n "s/^$2=//p" "$1" | head -n 1
}

no_copy_of_the_tickets_folder() {
  ! grep -q -E '^(TICKETS_DIR=docs/tickets|VERIFIED_PATHS=\(.*docs/tickets)' "$VERIFY"
}
check "o verify.sh lê a pasta dos tickets do arquivo, e não a tem escrita" no_copy_of_the_tickets_folder

same_contract_values() {
  [[ "$(value_of "$VERIFY" CONTRACT_DRIFT)" == "$(get contrato.desvio)" ]] || { echo "CONTRACT_DRIFT do verify.sh difere de contrato.desvio" >&2; return 1; }
  [[ "$(value_of "$ROOT/scripts/contract-lib.sh" CONTRACT_NODE)" == "$(get node.comando)" ]] || { echo "CONTRACT_NODE do contract-lib.sh difere de node.comando" >&2; return 1; }
  [[ "$(value_of "$ROOT/scripts/contract-lib.sh" API_SNAPSHOT) $(value_of "$ROOT/scripts/contract-lib.sh" API_SCHEMA)" == "$(get contrato.arquivos)" ]] || { echo "API_SNAPSHOT e API_SCHEMA do contract-lib.sh diferem de contrato.arquivos" >&2; return 1; }
}
check "o desvio, o Node e os arquivos do contrato que os scripts escrevem batem com o arquivo" same_contract_values

hook_folder_matches() {
  local folder
  folder="$(grep -o 'freeze-acceptance.sh [^" ]*' "$ROOT/.claude/settings.json" | awk '{print $2}')"
  [[ "$folder" == "$(get tickets.pasta)" ]]
}
check "o hook de congelamento recebe a mesma pasta dos tickets que o arquivo declara" hook_folder_matches

# Toda chave que uma skill do kit documenta existe no arquivo, menos as que valem o padrão da skill.
documented_keys_exist() {
  local key
  for key in $(grep -h -E '^ *\|' "$ROOT"/.claude/skills/{plan-ticket,revisao-conformidade,implement}/SKILL.md \
    | grep -o -E '`(tickets|node|contrato|plano|revisao|verificacao)\.[a-z-]+`' | tr -d '`' | sort -u); do
    [[ "$key" == revisao.revisor ]] && continue
    [[ -n "$(git config --file "$CONFIG" --get-all "$key")" ]] || { echo "uma skill documenta a chave $key, que o arquivo não declara" >&2; return 1; }
  done
}
check "toda chave que as skills documentam existe no arquivo" documented_keys_exist

finish "do arquivo de configuração do projeto"
