#!/usr/bin/env bash
#
# Testes da trava do modo completo (scripts/full-lock.sh), pelas funções que o scripts/verify.sh
# chama e pelo próprio verify.sh, nos modos que não rodam a verificação: o `full` travado, que recusa
# antes de tudo, o `full` que não deu para verificar, e o `unlock`. O verify.sh roda com o GIT_DIR de
# um repositório temporário, para o estado da trava ser o dele, e não o deste clone. Rodam na máquina,
# como o verify.sh. Quem chama é o scripts/verify.sh.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=sh-helpers.sh
source "$ROOT/scripts/test/sh-helpers.sh"

state="$(mktemp -d)"
trap 'rm -rf "$state"' EXIT

not() {
  ! "$@"
}

# As funções da trava, num subshell, com o estado num arquivo próprio e a variável CI dada (vazia,
# fora da CI).
# lock <CI> <arquivo> <comando...>
lock() {
  local ci="$1" file="$2"
  shift 2
  (
    export CI="$ci"
    FULL_LOCK_FILE="$file"
    # shellcheck source=../full-lock.sh
    source "$ROOT/scripts/full-lock.sh"
    "$@"
  )
}

# Registra uma reprovação com os passos dados e imprime quantas seguidas há.
# fail <arquivo> <passos...>
fail() {
  lock "" "$1" full_lock_record_failure "${@:2}"
}

locked() {
  lock "" "$1" full_lock_active
}

# A mesma falha três vezes seguidas trava; duas não.
file="$state/mesma"
fail "$file" "Web: suíte no navegador" >/dev/null
fail "$file" "Web: suíte no navegador" >/dev/null
check "duas reprovações iguais seguidas não travam" not locked "$file"
count="$(fail "$file" "Web: suíte no navegador")"
check "a terceira reprovação igual seguida conta três" test "$count" = 3
check "a terceira reprovação igual seguida trava" locked "$file"

# O conjunto de passos é a falha, em qualquer ordem, seja qual for o teste que falhou dentro deles.
file="$state/ordem"
fail "$file" "API: tipos" "Web: lint" >/dev/null
fail "$file" "Web: lint" "API: tipos" >/dev/null
count="$(fail "$file" "API: tipos" "Web: lint")"
check "os mesmos passos em outra ordem são a mesma falha" test "$count" = 3

# Outro conjunto recomeça a contagem em um.
file="$state/outra"
fail "$file" "Web: lint" >/dev/null
fail "$file" "Web: lint" >/dev/null
count="$(fail "$file" "Web: lint" "Aceite")"
check "uma reprovação com outro conjunto de passos recomeça em um" test "$count" = 1
check "a reprovação que recomeça não trava" not locked "$file"

# Uma aprovação zera a contagem.
file="$state/aprovada"
fail "$file" "Web: lint" >/dev/null
fail "$file" "Web: lint" >/dev/null
lock "" "$file" full_lock_reset
count="$(fail "$file" "Web: lint")"
check "uma aprovação zera a contagem" test "$count" = 1

# A trava vale só fora da CI.
check "fora da CI, a trava vale" lock "" "$state/ci" full_lock_enabled
check "na CI, a trava não vale" not lock true "$state/ci" full_lock_enabled

# O verify.sh, com o estado de um repositório temporário e a variável CI dada.
repo="$state/repo"
git init -q "$repo"
harness="$repo/.git/harness"
mkdir -p "$harness"
# verify <CI> <argumentos...>
verify() {
  CI="$1" GIT_DIR="$repo/.git" HARNESS_BASE_REF=nao-existe "$ROOT/scripts/verify.sh" "${@:2}"
}

# Travado: o `full` recusa com 2, antes de tudo, e manda pedir o destravamento ao usuário.
for _ in 1 2 3; do
  fail "$harness/full-lock" "Web: lint" >/dev/null
done
out="$(verify "" full 2>&1)"
code=$?
check "travado, o full sai com 2" test "$code" = 2
check "travado, o full manda parar e pedir ao usuário o \`! scripts/verify.sh unlock\`" \
  bash -c '[[ "$1" == *"! scripts/verify.sh unlock"* && "$1" != *"referência"* ]]' _ "$out"

# Na CI, a trava gravada não recusa: o full segue, e para só na base que não existe.
out="$(verify true full 2>&1)"
check "na CI, a trava gravada não recusa o full" \
  bash -c '[[ "$1" == *"referência"* && "$1" != *"travado"* ]]' _ "$out"

# O `unlock` tira a trava e a contagem.
out="$(verify "" unlock 2>&1)"
code=$?
check "o unlock sai com 0" test "$code" = 0
check "o unlock apaga a trava e a contagem" test ! -e "$harness/full-lock"

# Não deu para verificar (a base não existe): sai com 2 e não conta como reprovação.
fail "$harness/full-lock" "Web: lint" >/dev/null
fail "$harness/full-lock" "Web: lint" >/dev/null
verify "" full >/dev/null 2>&1
code=$?
check "o full que não deu para verificar sai com 2" test "$code" = 2
count="$(fail "$harness/full-lock" "Web: lint")"
check "o full que não deu para verificar não mexe na contagem" test "$count" = 3

finish "da trava"
