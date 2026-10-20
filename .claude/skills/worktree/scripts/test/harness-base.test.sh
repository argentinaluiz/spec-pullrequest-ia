#!/usr/bin/env bash
#
# Testes de scripts/harness-base.sh, a base do harness (o remoto e a branch principal, com `origin/main` por padrão): o
# arquivo é o dono único da leitura de HARNESS_BASE_REF, e o núcleo das frentes o carrega, sem definir o padrão por conta
# própria. Rodam na máquina, só com o shell. Os casos de aceite se ligam aos critérios pelo mapa de testes, e não pelo nome.

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPTS="$(cd "$HERE/.." && pwd)"
# shellcheck source=helpers.sh
source "$HERE/helpers.sh"

# base_of [HARNESS_BASE_REF]: "base remoto branch" que o arquivo dá, num shell à parte, com a variável dada ou sem ela.
base_of() {
  (
    unset HARNESS_BASE_REF
    [[ -z "${1:-}" ]] || export HARNESS_BASE_REF="$1"
    # shellcheck source=../harness-base.sh
    source "$SCRIPTS/harness-base.sh" || exit 1
    printf '%s %s %s' "$BASE_REF" "$BASE_REMOTE" "$BASE_BRANCH"
  )
}

check "sem HARNESS_BASE_REF, a base é origin/main, com o remoto origin e a branch main" \
  test "$(base_of)" = "origin/main origin main"
check "com HARNESS_BASE_REF=test/main, o remoto é test e a branch é main" \
  test "$(base_of test/main)" = "test/main test main"
check "numa branch com barra, o remoto é o que vem antes da primeira barra" \
  test "$(base_of origin/release/1)" = "origin/release/1 origin release/1"

# O núcleo carrega o arquivo com um `source` (e não só o cita num comentário) e não expande a variável: mudar o padrão no
# arquivo muda no núcleo.
check "o núcleo das frentes carrega o arquivo da base" grep -qE '^source .*harness-base\.sh' "$SCRIPTS/frentes.sh"
check "o núcleo das frentes não lê a variável da base nem define o padrão por conta própria" \
  bash -c '! grep -qE "^[^#]*[$]\{?HARNESS_BASE_REF" "$1"' _ "$SCRIPTS/frentes.sh"

finish "da base do harness"
