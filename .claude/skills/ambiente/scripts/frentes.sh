#!/usr/bin/env bash
#
# O atalho das frentes paralelas deste projeto: chama o núcleo da skill worktree com os valores daqui, para quem o usa
# não digitar opção nenhuma. Passa adiante o subcomando e os argumentos.
#
#   frentes.sh novo <ticket> [tipo]
#   frentes.sh listar
#   frentes.sh remover <ticket> [--forcar]
#
# Os valores deste projeto: o limite de 3 frentes ao todo, o ambiente por slot da frente (frente-ambiente.sh, desta
# skill) e a classificação dos pontos de convergência (pontos-de-convergencia.txt, desta skill). As regras de cada
# subcomando estão no cabeçalho do núcleo (.claude/skills/worktree/scripts/frentes.sh).

set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

exec "$SKILL_DIR/../worktree/scripts/frentes.sh" \
  --limite 3 \
  --ambiente "$SKILL_DIR/scripts/frente-ambiente.sh" \
  --pontos "$SKILL_DIR/pontos-de-convergencia.txt" \
  "$@"
