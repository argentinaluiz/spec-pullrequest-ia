#!/usr/bin/env bash
#
# Testes dos argumentos do modo `plan` do verify.sh: a ordem antiga (`plan <ticket> [<commit>]`)
# é recusada com a ordem nova (`plan <pai> <ticket> [<commit>]`) e um exemplo, e o atalho que passa os
# valores do projeto ao script da página (os que o .config/project declara). Os casos
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
mkdir -p "$repo/scripts" "$repo/$SK/verificar/scripts" "$repo/$SK/proteger-harness/scripts" "$repo/$SK/plan-ticket/scripts" "$repo/docs/tickets"
cp -R "$ROOT/$SK/verificar/scripts/verify.sh" "$ROOT/$SK/verificar/scripts/verify" "$ROOT/$SK/verificar/scripts/full-lock.sh" \
  "$ROOT/$SK/verificar/scripts/full-semaphore.sh" "$ROOT/$SK/verificar/scripts/git-mount.sh" "$repo/$SK/verificar/scripts/"
mkdir -p "$repo/.claude/skills/worktree/scripts" && cp "$ROOT/.claude/skills/worktree/scripts/harness-base.sh" "$repo/.claude/skills/worktree/scripts/"
cp "$ROOT/$SK/proteger-harness/scripts/harness-dir.sh" "$repo/$SK/proteger-harness/scripts/"
cp "$ROOT/scripts/contract-lib.sh" "$repo/scripts/"
cat >"$repo/$SK/plan-ticket/scripts/plan-page.sh" <<'FAKE'
#!/usr/bin/env bash
printf '%s\n' "$*" >"$FAKE_ARGS"
FAKE
chmod +x "$repo/$SK/plan-ticket/scripts/plan-page.sh"
git -C "$repo" init -q -b main
# Os valores do projeto de mentira são outros que os deste projeto, para provar que o atalho os lê do arquivo.
mkdir -p "$repo/.config"
cat >"$repo/.config/project" <<'CONFIG'
[tickets]
	pasta = outra/pasta
	documentos = outros-docs
[node]
	comando = bin/meu-node
[contrato]
	comando = bin/meu-contrato
	arquivos = a.json b.prisma
CONFIG

FAKE_ARGS="$tmp/args" env -u CLAUDE_PROJECT_DIR bash -c 'cd "$1" && .claude/skills/verificar/scripts/verify.sh plan PROJ-1 PROJ-2 abc1234' _ "$repo" >/dev/null 2>&1
args="$(cat "$tmp/args" 2>/dev/null)"
name="o atalho plan passa à página o Node e a visão do contrato das skills novas @LUI-197-CA1"
check "$name: o comando do Node é o do arquivo de configuração" bash -c '[[ $1 == *"--node bin/meu-node"* ]]' _ "$args"
check "$name: o comando do contrato é o do arquivo de configuração" bash -c '[[ $1 == *"--contrato bin/meu-contrato"* ]]' _ "$args"
check "$name: os arquivos do contrato, a pasta dos tickets, a dos documentos e o commit seguem" \
  bash -c '[[ $1 == *"--contrato-arquivos a.json b.prisma"* && $1 == *"--tickets outra/pasta"* && $1 == *"--documentos outros-docs"* && $1 == *"--commit abc1234"* ]]' _ "$args"

# Sem o arquivo, valem os padrões da skill de plano: a pasta dos tickets, o Node da máquina e nenhum contrato.
rm -f "$repo/.config/project"
FAKE_ARGS="$tmp/args" env -u CLAUDE_PROJECT_DIR bash -c 'cd "$1" && .claude/skills/verificar/scripts/verify.sh plan PROJ-1 PROJ-2' _ "$repo" >/dev/null 2>&1
args="$(cat "$tmp/args" 2>/dev/null)"
check "sem o arquivo de configuração, o atalho plan passa os padrões da skill de plano" \
  bash -c '[[ $1 == *"--tickets docs/tickets"* && $1 == *"--node node"* && $1 == *"--contrato nenhum"* && $1 != *"--contrato-arquivos"* && $1 != *"--documentos"* ]]' _ "$args"

finish "do modo plan do verify.sh"
