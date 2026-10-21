#!/usr/bin/env bash
#
# Teste do arquivo de configuração deste projeto (.config/project): ele declara os valores de que as skills do kit
# precisam, e os comandos e os arquivos que ele nomeia existem. Uma chave que sumiu, ou um caminho que ficou velho
# depois de um renomear, reprova aqui, e não só quando uma skill tenta usá-lo. Roda na máquina.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=../../.claude/skills/plan-ticket/scripts/test/helpers.sh
source "$ROOT/.claude/skills/plan-ticket/scripts/test/helpers.sh"

CONFIG="$ROOT/.config/project"

# get <chave>: o valor da chave no arquivo, ou nada.
get() {
  git config --file "$CONFIG" --get "$1"
}

check "o arquivo de configuração se lê como arquivo de configuração do Git" git config --file "$CONFIG" --list

declared() {
  local key
  for key in tickets.pasta tickets.documentos node.comando contrato.comando contrato.arquivos contrato.desvio \
    revisao.sempre protegidos.lista status.em-andamento status.em-revisao status.concluido branch.tipo-do-bug \
    branch.tipo-padrao verificacao.completa frentes.limite frentes.ambiente; do
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
  for path in $(get contrato.arquivos) "$(get tickets.pasta)" "$(get tickets.documentos)" "$(get protegidos.lista)"; do
    [[ -e "$ROOT/$path" ]] || { echo "$path não existe" >&2; return 1; }
  done
}
check "os arquivos e as pastas que o arquivo nomeia existem" files_exist

literal_paths_exist() {
  local line path
  # A chave `convergencia.<tipo>` guarda um caminho por linha; o padrão com `*` casa vários e não precisa existir.
  while IFS= read -r line; do
    path="${line#* }"
    [[ "$path" == *'*'* ]] && continue
    [[ -e "$ROOT/$path" ]] || { echo "convergencia aponta para $path, que não existe" >&2; return 1; }
  done < <(git config --file "$CONFIG" --get-regexp '^convergencia\.')
  # A seção `gerado "<arquivo>"` leva o caminho do arquivo gerado no nome dela.
  while IFS= read -r line; do
    path="${line%% *}"
    path="${path#gerado.}"
    path="${path%.regenerar}"
    [[ -e "$ROOT/$path" ]] || { echo "gerado aponta para $path, que não existe" >&2; return 1; }
  done < <(git config --file "$CONFIG" --get-regexp '^gerado\..*\.regenerar$')
}
check "os caminhos fixos de convergencia e de gerado existem" literal_paths_exist

# Toda chave que uma skill do kit documenta no passo 0 existe no arquivo, menos o revisor, que vale o padrão da skill.
documented_keys_exist() {
  local key
  for key in $(grep -h -E '^ *\|' "$ROOT"/.claude/skills/{plan-ticket,revisao-conformidade,implement,worktree}/SKILL.md \
    | grep -o -E '`(tickets|node|contrato|revisao|protegidos|status|branch|verificacao|frentes|sincronizar)\.[a-z-]+`' \
    | tr -d '`' | sort -u); do
    [[ "$key" == revisao.revisor ]] && continue
    [[ -n "$(git config --file "$CONFIG" --get-all "$key")" ]] || { echo "uma skill documenta a chave $key, que o arquivo não declara" >&2; return 1; }
  done
}
check "toda chave que as skills documentam existe no arquivo" documented_keys_exist

finish "do arquivo de configuração do projeto"
