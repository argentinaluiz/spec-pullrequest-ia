#!/usr/bin/env bash
#
# Testes dos argumentos do modo `plan` do verify.sh: a ordem antiga (`plan <ticket> [<commit>]`)
# é recusada com a ordem nova (`plan <pai> <ticket> [<commit>]`) e um exemplo, e o atalho que passa os
# valores do projeto ao script da página (o Node e a visão do contrato, das skills ambiente e contrato). Os casos
# recusados rodam no repositório, porque param antes de chamar a página do plano; o do atalho roda numa cópia da
# verificação num repositório temporário, com o script da página trocado por um falso, que registra os argumentos.
# Rodam na máquina, como o verify.sh.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../../../.." && pwd)"
# shellcheck source=sh-helpers.sh
source "$ROOT/.claude/skills/verificar/scripts/test/sh-helpers.sh"

# plan <argumentos...>: roda `verify.sh plan` e deixa a saída de erro em $err e o código em $code.
plan() {
  err="$(cd "$ROOT" && .claude/skills/verificar/scripts/verify.sh plan "$@" 2>&1 >/dev/null)"
  code=$?
}

contains() {
  [[ "$err" == *"$1"* ]]
}

plan PROJ-171
check "recusa só o ticket, com código 2" test $code -eq 2
check "diz que falta o <pai>" contains "falta o <pai>"
check "mostra a ordem nova, com exemplo" contains "plan <pai> <ticket> [<commit>]"
check "o exemplo traz uma issue pai e um ticket" contains ".claude/skills/verificar/scripts/verify.sh plan PROJ-1 PROJ-123"

plan PROJ-171 abc1234
check "recusa a ordem antiga, ticket e commit, com código 2" test $code -eq 2
check "diz que o comando agora é com o <pai>" contains "plan <pai> <ticket> [<commit>]"

plan pai PROJ-171
check "recusa um <pai> que não tem a forma PREFIXO-N" test $code -eq 2
check "a mensagem do <pai> inválido mostra o comando novo" contains "plan <pai> <ticket> [<commit>]"

plan PROJ-162 ticket
check "recusa um <ticket> que não tem a forma PREFIXO-N" test $code -eq 2
check "a mensagem do <ticket> inválido mostra o comando novo" contains "plan <pai> <ticket> [<commit>]"

# O atalho: roda numa cópia da verificação, com o plan-page.sh falso.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
repo="$tmp/repo"
SK=.claude/skills
mkdir -p "$repo/scripts" "$repo/$SK/verificar/scripts" "$repo/$SK/proteger-harness/scripts" "$repo/$SK/contrato/scripts" "$repo/$SK/plan-ticket/scripts" "$repo/docs/tickets"
cp -R "$ROOT/$SK/verificar/scripts/verify.sh" "$ROOT/$SK/verificar/scripts/verify" "$ROOT/$SK/verificar/scripts/full-lock.sh" \
  "$ROOT/$SK/verificar/scripts/full-semaphore.sh" "$ROOT/$SK/verificar/scripts/git-mount.sh" "$repo/$SK/verificar/scripts/"
mkdir -p "$repo/.claude/skills/worktree/scripts" && cp "$ROOT/.claude/skills/worktree/scripts/harness-base.sh" "$repo/.claude/skills/worktree/scripts/"
cp "$ROOT/$SK/proteger-harness/scripts/harness-dir.sh" "$repo/$SK/proteger-harness/scripts/"
cp "$ROOT/$SK/contrato/scripts/contract-lib.sh" "$repo/$SK/contrato/scripts/"
cat >"$repo/$SK/plan-ticket/scripts/plan-page.sh" <<'FAKE'
#!/usr/bin/env bash
printf '%s\n' "$*" >"$FAKE_ARGS"
FAKE
chmod +x "$repo/$SK/plan-ticket/scripts/plan-page.sh"
git -C "$repo" init -q -b main

FAKE_ARGS="$tmp/args" env -u CLAUDE_PROJECT_DIR bash -c 'cd "$1" && .claude/skills/verificar/scripts/verify.sh plan PROJ-1 PROJ-2 abc1234' _ "$repo" >/dev/null 2>&1
args="$(cat "$tmp/args" 2>/dev/null)"
name="o atalho plan passa à página o Node e a visão do contrato das skills novas @LUI-197-CA1"
check "$name: o comando do Node é o script da raiz" bash -c '[[ $1 == *"--node scripts/node-in-api.sh"* ]]' _ "$args"
check "$name: o comando do contrato é a visão da skill contrato" bash -c '[[ $1 == *"--contrato .claude/skills/contrato/scripts/contract-view.sh"* ]]' _ "$args"
check "$name: os arquivos do contrato e o commit seguem" \
  bash -c '[[ $1 == *"--contrato-arquivos apps/api/openapi.json apps/api/prisma/schema.prisma"* && $1 == *"--commit abc1234"* ]]' _ "$args"
check "$name: o Node e o contrato apontados existem" test -x "$ROOT/scripts/node-in-api.sh" -a -x "$ROOT/$SK/contrato/scripts/contract-view.sh"

finish "do modo plan do verify.sh"
