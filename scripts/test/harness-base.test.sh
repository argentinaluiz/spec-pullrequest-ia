#!/usr/bin/env bash
#
# Testes do scripts/harness-base.sh, a base do harness (o remoto e a branch principal, com `origin/main` por
# padrão): o arquivo é o dono único da leitura de HARNESS_BASE_REF, e o .claude/skills/verificar/scripts/verify.sh e o
# scripts/frentes.sh o carregam, sem definir o padrão por conta própria. Rodam na máquina, só com o shell.
# Quem chama é o .claude/skills/verificar/scripts/verify.sh.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=../../.claude/skills/verificar/scripts/test/sh-helpers.sh
source "$ROOT/.claude/skills/verificar/scripts/test/sh-helpers.sh"

# base_of [HARNESS_BASE_REF]: "base remoto branch" que o arquivo dá, num shell à parte, com a variável dada ou sem ela.
base_of() {
  (
    unset HARNESS_BASE_REF
    [[ -z "${1:-}" ]] || export HARNESS_BASE_REF="$1"
    # shellcheck source=../harness-base.sh
    source "$ROOT/scripts/harness-base.sh" || exit 1
    printf '%s %s %s' "$BASE_REF" "$BASE_REMOTE" "$BASE_BRANCH"
  )
}

check "sem HARNESS_BASE_REF, a base é origin/main, com o remoto origin e a branch main @LUI-192-CA1" \
  test "$(base_of)" = "origin/main origin main"
check "com HARNESS_BASE_REF=test/main, o remoto é test e a branch é main @LUI-192-CA1" \
  test "$(base_of test/main)" = "test/main test main"
check "numa branch com barra, o remoto é o que vem antes da primeira barra @LUI-192-CA1" \
  test "$(base_of origin/release/1)" = "origin/release/1 origin release/1"

# O frentes.sh e o verify.sh carregam o arquivo com um `source` (e não só o citam num comentário), e nenhum dos dois
# expande a variável: mudar o padrão no arquivo muda nos dois.
check "o verify.sh carrega o arquivo da base @LUI-192-CA1" grep -qE '^source .*harness-base\.sh' "$ROOT/.claude/skills/verificar/scripts/verify.sh"
check "o frentes.sh carrega o arquivo da base @LUI-192-CA1" grep -qE '^source .*harness-base\.sh' "$ROOT/scripts/frentes.sh"
check "nem o verify.sh nem o frentes.sh leem a variável da base nem definem o padrão por conta própria @LUI-192-CA1" \
  bash -c '! grep -qE "^[^#]*[$]\{?HARNESS_BASE_REF" "$@"' _ "$ROOT/.claude/skills/verificar/scripts/verify.sh" "$ROOT/scripts/frentes.sh"

finish "do scripts/harness-base.sh"
