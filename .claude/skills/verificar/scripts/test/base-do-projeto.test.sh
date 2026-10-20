#!/usr/bin/env bash
#
# Teste da base do harness no lado do projeto: a verificação carrega a definição única da base da skill worktree
# (harness-base.sh) e não lê a variável HARNESS_BASE_REF nem define o padrão por conta própria; a variável a ajusta nos
# dois, no núcleo das frentes e na verificação, porque os dois leem o mesmo arquivo. Roda na máquina, só com o shell. O
# caso leva a tag do critério de aceite no nome.

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../../.." && pwd)"
# shellcheck source=sh-helpers.sh
source "$HERE/sh-helpers.sh"

VERIFY="$ROOT/.claude/skills/verificar/scripts/verify.sh"
BASE="$ROOT/.claude/skills/worktree/scripts/harness-base.sh"
CORE="$ROOT/.claude/skills/worktree/scripts/frentes.sh"
name="a base tem uma definição só, carregada pelo núcleo e pela verificação do projeto, e a variável a ajusta nos dois @LUI-199-CA4"

check "$name: a verificação carrega o arquivo da base da skill worktree" \
  grep -qxF 'source .claude/skills/worktree/scripts/harness-base.sh' "$VERIFY"
check "$name: a verificação não lê a variável da base nem define o padrão por conta própria" \
  bash -c '! grep -qE "^[^#]*[$]\{?HARNESS_BASE_REF" "$1"' _ "$VERIFY"
check "$name: o núcleo e a verificação carregam o mesmo arquivo" \
  bash -c 'grep -q "harness-base.sh" "$1" && grep -q "harness-base.sh" "$2"' _ "$CORE" "$VERIFY"

# A variável ajusta a base da verificação: o `apps` não a usa, mas o `prepush` falha dizendo a base que não existe.
base_in_the_message() {
  local out
  out="$(cd "$ROOT" && HARNESS_BASE_REF=nao-existe/main CLAUDE_PROJECT_DIR="$ROOT" "$VERIFY" prepush 2>&1)"
  [[ "$out" == *"nao-existe/main"* ]]
}
check "$name: a variável ajusta a base da verificação, que a cita quando ela não existe" base_in_the_message
base_of_the_core() {
  (
    unset HARNESS_BASE_REF
    export HARNESS_BASE_REF=nao-existe/main
    source "$BASE" && [[ "$BASE_REF" == nao-existe/main ]]
  )
}
check "$name: a variável ajusta a base do núcleo, que lê o mesmo arquivo" base_of_the_core

finish "da base no lado do projeto"
