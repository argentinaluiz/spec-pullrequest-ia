#!/usr/bin/env bash
#
# Teste da lista de arquivos protegidos deste projeto (arquivos-protegidos.txt, da skill verificar): a
# Guarda da skill proteger-harness, chamada com a lista real, bloqueia o mecanismo de qualquer skill e a
# própria lista, e deixa o texto das skills livre. Roda na máquina, num diretório temporário que faz as vezes
# da `main`. O caso leva a tag do critério de aceite no nome.

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../../.." && pwd)"
GUARD="$ROOT/.claude/skills/proteger-harness/scripts/harness-guard.sh"
LIST="$ROOT/.claude/skills/verificar/arquivos-protegidos.txt"
# shellcheck source=../../../../../scripts/test/sh-helpers.sh
source "$ROOT/scripts/test/sh-helpers.sh"

command -v jq >/dev/null || { echo "Falta o \`jq\` na máquina: a Guarda e o teste dela precisam dele."; exit 2; }

main="$(mktemp -d)"
trap 'rm -rf "$main"' EXIT

# guard <caminhos...>: roda a Guarda com a lista real, e deixa a saída em $out e o código em $code.
guard() {
  out="$(cd "$main" && printf '%s\n' "$@" | "$GUARD" "$LIST" 2>&1)"
  code=$?
}

name="a lista do projeto bloqueia o mecanismo de qualquer skill e a própria lista, e deixa o texto das skills livre @LUI-194-CA3"

blocked() {
  guard "$1"
  [[ $code -eq 1 && "$out" == *"$1 só muda por override"* ]]
}

passes_clean() {
  guard "$1"
  [[ $code -eq 0 && "$out" != *"::warning"* ]]
}

passes_warning() {
  guard "$1"
  [[ $code -eq 0 && "$out" == *"::warning"*"$1"* ]]
}

for path in \
  .claude/skills/plan-ticket/scripts/plan-page.sh \
  .claude/skills/qualquer-skill-nova/scripts/test/x.test.sh \
  .claude/skills/proteger-harness/hooks/state-guard.sh \
  .claude/skills/qualquer-skill-nova/hooks/test/y.test.sh \
  .claude/skills/verificar/arquivos-protegidos.txt \
  .claude/agents/revisor-conformidade.md \
  .claude/hooks/push-verify.sh \
  .claude/settings.json \
  .github/workflows/ci.yml \
  scripts/verify.sh \
  scripts/test/sh-helpers.sh; do
  check "$name: bloqueia $path" blocked "$path"
done

for path in \
  .claude/skills/plan-ticket/SKILL.md \
  .claude/skills/plan-ticket/formatos/aceite.md \
  .claude/skills/revisao-conformidade/agents/revisor-conformidade.md \
  .claude/skills/qualquer-skill-nova/SKILL.md \
  .claude/skills/verificar/SKILL.md \
  docs/hld.md \
  apps/api/src/main.ts; do
  check "$name: deixa $path livre" passes_clean "$path"
done

for path in \
  docs/tickets/PROJ-1/PROJ-2/mapa-de-testes.json \
  apps/api/openapi.json \
  apps/api/prisma/migrations/20260101000000_x/migration.sql \
  AGENTS.md; do
  check "$name: avisa $path, sem bloquear" passes_warning "$path"
done

finish "da lista de arquivos protegidos"
