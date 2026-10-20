#!/usr/bin/env bash
#
# Testes do semáforo do modo completo (.claude/skills/verificar/scripts/full-semaphore.sh): um `full` por vez entre os checkouts
# do mesmo repositório, com a espera dizendo de qual checkout é o que está rodando, e a espera, mesmo
# interrompida, sem contar como reprovação na trava das reprovações repetidas. Usam um repositório
# temporário com um worktree, que dividem o `.git` comum onde fica a trava. O `full` "de outro checkout"
# é um processo do próprio teste que segura a trava: nenhuma verificação roda. Rodam na máquina, porque
# usam o `git` e o `flock`. Quem chama é o .claude/skills/verificar/scripts/verify.sh.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../../../.." && pwd)"
# shellcheck source=sh-helpers.sh
source "$ROOT/.claude/skills/verificar/scripts/test/sh-helpers.sh"

for tool in git flock; do
  command -v "$tool" >/dev/null || { echo "Falta o \`$tool\` na máquina: o teste do semáforo precisa dele."; exit 2; }
done

work="$(cd "$(mktemp -d)" && pwd -P)"
pids=()
cleanup() {
  [[ ${#pids[@]} -eq 0 ]] || kill "${pids[@]}" 2>/dev/null
  rm -rf "$work"
}
trap cleanup EXIT

# Dois checkouts do mesmo repositório: a pasta do repositório e um worktree.
repo="$work/principal"
git init -q "$repo"
git -C "$repo" -c user.name=t -c user.email=t@t commit -q --allow-empty -m inicial
git -C "$repo" worktree add -q -b feature/outra "$work/outro"
git -C "$repo" checkout -q -b feature/principal
common="$repo/.git"
# A espera consulta a trava a cada décimo de segundo, e não a cada segundo.
export FULL_SEMAPHORE_POLL=0.1

# until_true <segundos> <comando...>: repete o comando, a cada décimo de segundo, até ele sair com 0 ou o
# prazo acabar.
until_true() {
  local seconds="$1" tries i
  shift
  tries=$((seconds * 10))
  for ((i = 0; i < tries; i++)); do
    "$@" && return 0
    sleep 0.1
  done
  return 1
}

# O `full` em andamento no checkout dado: pede o semáforo e o segura até o arquivo $release existir.
# holder <checkout> <branch> <arquivo que diz que pegou> <arquivo que manda soltar>
holder() {
  bash -c '
    source "$1/.claude/skills/verificar/scripts/full-semaphore.sh"
    cd "$2" || exit 1
    full_semaphore_acquire "$2" "$3" && : >"$4"
    while [ ! -e "$5" ]; do sleep 0.1; done
  ' _ "$ROOT" "$1" "$2" "$3" "$4" >"$3.out" 2>&1 &
  pids+=("$!")
}

has() {
  [[ -e "$1" ]]
}

contains() {
  grep -qF -- "$2" "$1" 2>/dev/null
}

# --- CA1: o full espera o de outro checkout, diz de qual é, e começa quando ele termina ---
ca1() {
  local first_has="$work/primeiro.pegou" first_release="$work/primeiro.solta"
  local second_has="$work/segundo.pegou" second_release="$work/segundo.solta"

  # O primeiro checkout pega a trava e a segura.
  holder "$repo" feature/principal "$first_has" "$first_release"
  until_true 10 has "$first_has" || return 1

  # O segundo pede a vez: não começa, e diz de quem está esperando.
  holder "$work/outro" feature/outra "$second_has" "$second_release"
  until_true 10 contains "$second_has.out" "$repo" || return 1
  contains "$second_has.out" "feature/principal" || return 1
  contains "$second_has.out" "Aguardando" || return 1
  sleep 0.5
  has "$second_has" && return 1

  # O primeiro termina: o segundo começa, e passa a ser ele o `full` em andamento.
  : >"$first_release"
  until_true 15 has "$second_has" || return 1
  contains "$common/harness/full.owner" "checkout=$work/outro" &&
    contains "$common/harness/full.owner" "branch=feature/outra"
  local status=$?
  : >"$second_release"
  return $status
}
check "o full espera o de outro checkout, diz de qual é, e começa quando ele termina @LUI-185-CA1" ca1

# --- CA2: a espera, mesmo interrompida, não conta como reprovação nem apaga a aprovação ---

# O `verify.sh` com o estado de um repositório temporário (o padrão do full-lock.test.sh) e um `docker`
# falso à frente no PATH: se ele passar do semáforo, aborta no primeiro passo, e nenhuma suíte roda.
mkdir -p "$work/bin"
printf '#!/usr/bin/env bash\nexit 1\n' >"$work/bin/docker"
chmod +x "$work/bin/docker"
harness="$repo/.harness"
mkdir -p "$harness"

# shellcheck source=../full-lock.sh
source "$ROOT/.claude/skills/verificar/scripts/full-lock.sh"
FULL_LOCK_FILE="$harness/full-lock"

ca2() {
  local has="$work/terceiro.pegou" release="$work/terceiro.solta" out="$work/verify.out" pid
  full_lock_record_failure "Web: lint" >/dev/null
  full_lock_record_failure "Web: lint" >/dev/null
  printf 'state=aprovado-antes\nacceptance=checked\n' >"$harness/full-ok"
  local lock_before approval_before
  lock_before="$(cat "$harness/full-lock")"
  approval_before="$(cat "$harness/full-ok")"

  # Um `full` de outro checkout em andamento.
  holder "$work/outro" feature/outra "$has" "$release"
  until_true 10 has "$has" || return 1

  # O `verify.sh full` espera a vez, e é interrompido na espera. Fora da CI: sem a variável CI.
  env -u CI -u GITHUB_ACTIONS PATH="$work/bin:$PATH" CLAUDE_PROJECT_DIR="$repo" GIT_DIR="$repo/.git" GIT_WORK_TREE="$repo" HARNESS_BASE_REF=HEAD \
    "$ROOT/.claude/skills/verificar/scripts/verify.sh" full >"$out" 2>&1 &
  pid=$!
  if ! until_true 10 contains "$out" "Aguardando" || ! contains "$out" "$work/outro"; then
    kill "$pid" 2>/dev/null
    : >"$release"
    return 1
  fi
  kill -TERM "$pid"
  wait "$pid" 2>/dev/null
  : >"$release"

  # Nada mudou: a contagem das reprovações, a aprovação anterior, e a saída não fala de reprovação nem
  # de passo.
  [[ "$(cat "$harness/full-lock")" == "$lock_before" ]] &&
    [[ "$(cat "$harness/full-ok")" == "$approval_before" ]] &&
    ! contains "$out" "REPROVADO" &&
    ! contains "$out" "=== " &&
    # A trava da máquina não ficou presa pelo `full` interrompido, e o que segurava a soltou.
    until_true 10 flock -n "$common/harness/full.lock" true
}
check "a espera, mesmo interrompida, não conta como reprovação nem apaga a aprovação @LUI-185-CA2" ca2

# --- A trava sai com o processo: um filho que o sobrevive não a segura ---
# Um `full` que roda um comando em primeiro plano (como o `step`), e esse comando deixa um processo de
# longa duração vivo depois que o `full` termina. $1 é "full_semaphore_unheld", ou vazio para o controle.
# survivor <prefixo do comando> <arquivo do PID do sobrevivente>
survivor() {
  bash -c '
    source "$1/.claude/skills/verificar/scripts/full-semaphore.sh"
    cd "$2" || exit 1
    full_semaphore_acquire "$2" feature/principal >/dev/null
    $3 bash -c "sleep 30 >/dev/null 2>&1 & echo \$! >\"\$1\"" _ "$4"
  ' _ "$ROOT" "$repo" "$1" "$2"
}

survivor_does_not_hold() {
  local pid_file="$work/sobrevivente.pid" free=0
  survivor full_semaphore_unheld "$pid_file"
  # O `full` terminou, o processo que ele deixou segue vivo, e a trava está livre.
  kill -0 "$(cat "$pid_file")" 2>/dev/null &&
    until_true 5 flock -n "$common/harness/full.lock" true && free=1
  kill "$(cat "$pid_file")" 2>/dev/null
  [[ $free -eq 1 ]] || return 1

  # Controle: o mesmo comando, sem `full_semaphore_unheld`, herda o descritor e segura a trava.
  survivor "" "$pid_file"
  ! flock -n "$common/harness/full.lock" true
  local held=$?
  kill "$(cat "$pid_file")" 2>/dev/null
  return $held
}
check "um processo que sobrevive ao full não segura a trava da máquina" survivor_does_not_hold

finish "do semáforo do modo completo"
