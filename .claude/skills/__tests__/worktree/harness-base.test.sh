#!/usr/bin/env bash
#
# Testes de scripts/harness-base.sh, a base do harness e a pasta das travas da máquina: o arquivo é o dono único da
# leitura de HARNESS_BASE_REF e do padrão da base (`origin/main`, ou o ramo principal que o remoto de origem diz), e o
# núcleo das frentes o carrega, sem definir o padrão por conta própria. Rodam na máquina, só com o shell e o Git, num
# repositório temporário. Os casos de aceite se ligam aos critérios pelo mapa de testes, e não pelo nome.

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPTS="$(cd "$HERE/../../worktree/scripts" && pwd)"
# shellcheck source=../helpers.sh
source "$HERE/../helpers.sh"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
# Um repositório sem remoto: o remoto de origem não diz o ramo principal, e vale o padrão.
repo="$tmp/repo"
git init -q -b main "$repo"

# base_of [HARNESS_BASE_REF]: "base remoto branch" que o arquivo dá no repositório temporário, num shell à parte, com a
# variável dada ou sem ela.
base_of() {
  (
    cd "$repo" || exit 1
    unset HARNESS_BASE_REF
    [[ -z "${1:-}" ]] || export HARNESS_BASE_REF="$1"
    # shellcheck source=../../worktree/scripts/harness-base.sh
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

# O remoto de origem diz que o ramo principal é outro: sem a variável, a base é ele; com a variável, vale a variável.
git -C "$repo" commit -q --allow-empty -m base
git -C "$repo" update-ref refs/remotes/origin/principal HEAD
git -C "$repo" symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/principal
check "sem HARNESS_BASE_REF, a base é o ramo principal que o remoto de origem diz, quando ele diz" \
  test "$(base_of)" = "origin/principal origin principal"
check "com HARNESS_BASE_REF, vale a variável, mesmo quando o remoto de origem diz outro ramo" \
  test "$(base_of test/main)" = "test/main test main"

lock_dir_of() {
  (
    cd "$1" || exit 1
    # shellcheck source=../../worktree/scripts/harness-base.sh
    source "$SCRIPTS/harness-base.sh" && harness_lock_dir
  )
}
git -C "$repo" worktree add -q "$tmp/frente" -b frente
check "a pasta das travas da máquina é a mesma no checkout principal e num worktree" \
  test "$(lock_dir_of "$repo")" = "$(lock_dir_of "$tmp/frente")"
check "a pasta das travas da máquina é a harness do diretório comum do Git" \
  test "$(lock_dir_of "$tmp/frente")" = "$(cd "$repo/.git" && pwd -P)/harness"

# O núcleo carrega o arquivo com um `source` (e não só o cita num comentário) e não expande a variável: mudar o padrão
# no arquivo muda no núcleo.
check "o núcleo das frentes carrega o arquivo da base" grep -qE '^source .*harness-base\.sh' "$SCRIPTS/frentes.sh"
check "o núcleo das frentes não lê a variável da base nem define o padrão por conta própria" \
  bash -c '! grep -qE "^[^#]*[$]\{?HARNESS_BASE_REF" "$1"' _ "$SCRIPTS/frentes.sh"

finish "da base do harness"
