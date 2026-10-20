#!/usr/bin/env bash
#
# Teste da cópia instalada do revisor de conformidade (.claude/agents/revisor-conformidade.md): ela é o modelo da skill
# revisao-conformidade (revisor.md) com o cabeçalho do agente e a ferramenta do Linear, e nada mais. A cópia é a que roda e é
# protegida; o modelo é o texto livre da skill. Roda na máquina. O caso leva a tag do critério de aceite no nome.

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../../.." && pwd)"
# shellcheck source=sh-helpers.sh
source "$HERE/sh-helpers.sh"

MODEL="$ROOT/.claude/skills/revisao-conformidade/revisor.md"
INSTALLED="$ROOT/.claude/agents/revisor-conformidade.md"
name="a cópia instalada do revisor é o modelo da skill mais a ferramenta do Linear @LUI-198-CA3"

# O cabeçalho da cópia: as linhas entre os dois `---` do começo. O corpo é o que vem depois, sem a linha em branco que os separa.
header="$(awk 'NR == 1 && $0 == "---" { inside = 1; next } inside && $0 == "---" { exit } inside' "$INSTALLED")"

body_is_model() {
  diff -q <(awk 'NR == 1 && $0 == "---" { inside = 1; next } inside && $0 == "---" { inside = 0; started = 1; skip = 1; next } started { if (skip && $0 == "") { skip = 0; next } skip = 0; print }' "$INSTALLED") "$MODEL" >/dev/null
}
check "$name: o corpo da cópia é o modelo, byte a byte" body_is_model
check "$name: o cabeçalho da cópia dá o nome do agente" bash -c '[[ "$1" == *"name: revisor-conformidade"* ]]' _ "$header"
check "$name: a única ferramenta do projeto no cabeçalho é a do Linear" \
  bash -c '[[ "$1" == *"tools: Read, Grep, Glob, mcp__linear-server__get_issue"* ]]' _ "$header"
check "$name: o modelo não cita arquivo, comando nem ferramenta deste projeto" \
  bash -c '! grep -qE "apps/|scripts/|\.claude/|docs/|verify\.sh|AGENTS\.md|linear-server|Linear" "$1"' _ "$MODEL"

finish "da cópia instalada do revisor"
