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

finish "do arquivo de configuração do projeto"
