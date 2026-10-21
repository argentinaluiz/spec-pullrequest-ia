#!/usr/bin/env bash
#
# Teste do passo da ordem das migrações do grupo da API (api.sh): as migrações novas da
# branch têm de vir depois da mais recente da base, porque o Prisma as aplica na ordem do nome. Roda a
# função `api_migration_order` num repositório temporário, onde a base é um commit e a branch é a pasta
# de trabalho. Rodam na máquina, porque usam o `git`. Quem chama é o verify.sh.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../../../.." && pwd)"
# shellcheck source=../../../plan-ticket/scripts/test/helpers.sh
source "$ROOT/.claude/skills/plan-ticket/scripts/test/helpers.sh"
# shellcheck source=../verify/api.sh
source "$ROOT/.claude/skills/verificar/scripts/verify/api.sh"

# O que o verify.sh define e a função usa: a base já foi conferida (require_base) e o comando do contêiner.
require_base() { :; }
EXEC="docker compose -f compose.dev.yaml exec"

command -v git >/dev/null || { echo "Falta o \`git\` na máquina: o teste precisa dele."; exit 2; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
repo="$work/repo"

# A base: duas migrações e o arquivo de trava do Prisma, a mais recente é a 20261015122813_a.
git init -q "$repo"
for name in 20261009000000_enable_extensions 20261015122813_a; do
  mkdir -p "$repo/$API_MIGRATIONS/$name"
  echo "-- $name" >"$repo/$API_MIGRATIONS/$name/migration.sql"
done
echo 'provider = "postgresql"' >"$repo/$API_MIGRATIONS/migration_lock.toml"
git -C "$repo" add -A
git -C "$repo" -c user.name=t -c user.email=t@t commit -q -m base
git -C "$repo" branch base

# order <migrações novas...>: a função, numa pasta de trabalho que parte da base e tem as migrações dadas,
# com a saída em $out e o código em $code.
order() {
  local name
  git -C "$repo" reset -q --hard base && git -C "$repo" clean -fdq
  for name in "$@"; do
    mkdir -p "$repo/$API_MIGRATIONS/$name"
    echo "-- $name" >"$repo/$API_MIGRATIONS/$name/migration.sql"
  done
  out="$(cd "$repo" && BASE_REF=base api_migration_order 2>&1)"
  code=$?
}

contains() {
  [[ "$out" == *"$1"* ]]
}

# A migração nova antes da mais recente da base reprova, e diz como recriá-la; as que vêm depois aprovam.
ca3() {
  order 20261010000000_b
  [[ $code -ne 0 ]] || return 1
  contains "20261010000000_b" && contains "20261015122813_a" || return 1
  # Como recriar: um nome posterior, e o banco local de novo.
  contains "git mv" && contains "migrate dev --name" || return 1

  order 20261020000000_c
  [[ $code -eq 0 ]] || return 1

  # Sem migração nova, aprova.
  order
  [[ $code -eq 0 ]] || return 1

  # Uma antes e outra depois: reprova só por causa da que está antes.
  order 20261010000000_b 20261020000000_c
  [[ $code -ne 0 ]] && contains "20261010000000_b" && ! contains "20261020000000_c"
}
check "reprova a migração nova anterior à mais recente da base, diz como recriá-la e aprova quando todas vêm depois @LUI-185-CA3" ca3

# A migração que a branch apaga não é problema deste passo.
removed_is_ignored() {
  order 20261020000000_c
  rm -rf "$repo/$API_MIGRATIONS/20261009000000_enable_extensions"
  (cd "$repo" && BASE_REF=base api_migration_order) >/dev/null 2>&1
}
check "a migração que a branch apaga não reprova o passo" removed_is_ignored

# Uma base que não se lê reprova o passo, dizendo isso, em vez de aprovar no escuro.
unreadable_base() {
  order 20261020000000_c
  out="$(cd "$repo" && BASE_REF=nao-existe api_migration_order 2>&1)"
  code=$?
  [[ $code -ne 0 ]] && contains "nao-existe"
}
check "uma base que não se lê reprova o passo, dizendo qual" unreadable_base

finish "do passo da ordem das migrações"
