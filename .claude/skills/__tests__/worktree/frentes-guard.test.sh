#!/usr/bin/env bash
#
# Testes do hook das frentes (hooks/frentes-guard.sh), pela entrada que o Claude Code entrega a ele (um JSON pela entrada
# padrão) e pela decisão que ele devolve (0 libera, 2 nega). Rodam na máquina, como o hook, porque ele usa o `jq`, que o
# contêiner `api` não tem. Os casos de aceite se ligam aos critérios pelo mapa de testes, e não pelo nome.

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
HOOK="$HERE/../../worktree/hooks/frentes-guard.sh"
# shellcheck source=../helpers.sh
source "$HERE/../helpers.sh"

command -v jq >/dev/null || { echo "Falta o \`jq\` na máquina: o hook e o teste dele precisam dele."; exit 2; }

# expect <código esperado> <nome> <entrada> [trecho esperado na saída de erro]
expect() {
  expect_hook "$HOOK" "$@"
}

# A entrada do hook para a ferramenta de shell, com o comando dado.
# command_input <comando>
command_input() {
  jq -n --arg command "$1" '{tool_input: {command: $command}}'
}

# O `remover` com a opção de abandono, no script de frentes, é só do usuário.
expect 2 "nega ao agente o remover com a opção de abandono, com ela em qualquer posição" \
  "$(command_input 'scripts/frentes.sh remover PROJ-186 --forcar')" "só o usuário abandona uma frente"
expect 2 "nega a opção antes do ticket e embrulhada no bash -c" \
  "$(command_input "bash -c 'cd /repo && ./scripts/frentes.sh remover --forcar PROJ-186'")" "só o usuário abandona uma frente"
expect 2 "nega a opção pelo caminho completo do núcleo, seja qual for a pasta" \
  "$(command_input '.claude/skills/worktree/scripts/frentes.sh remover PROJ-186 --forcar')" "só o usuário abandona uma frente"
expect 0 "libera o remover sem a opção, o novo e o listar" \
  "$(command_input 'scripts/frentes.sh remover PROJ-186 && scripts/frentes.sh novo PROJ-187 && scripts/frentes.sh listar')"

# O `frentes.sh` com as variáveis do modo de teste trocaria o `gh` e contornaria o merge do `remover`.
expect 2 "nega o frentes.sh com o gh trocado pelo modo de teste" \
  "$(command_input 'HARNESS_TEST=1 FRENTES_GH=./gh-falso scripts/frentes.sh remover PROJ-186')" "modo de teste do harness"
expect 2 "nega a variável do modo de teste depois do script e embrulhada no bash -c" \
  "$(command_input "bash -c 'scripts/frentes.sh listar; export FRENTES_DOCKER=./x'")" "modo de teste do harness"
expect 2 "nega a entrada ilegível que cita o frentes.sh e a opção de abandono" \
  "isto não é json frentes.sh remover x --forcar" "só o usuário abandona uma frente"
expect 0 "libera o HARNESS_TEST em outro comando, como o dos testes do harness" \
  "$(command_input 'HARNESS_TEST=1 bash scripts/test/frentes.test.sh')"
expect 0 "libera o frentes.sh com uma variável que não é do modo de teste" \
  "$(command_input 'LANG=C scripts/frentes.sh novo PROJ-1')"
expect 0 "libera um comando que só cita a palavra do abandono" "$(command_input 'git commit -m "documenta o abandono"')"
expect 0 "libera um comando qualquer" "$(command_input 'git status --short')"

finish "do hook das frentes"
