#!/usr/bin/env bash
#
# Hook de antes do comando do Claude Code (evento PreToolUse, ferramenta Bash). Nega ao agente dois usos do script de
# frentes que são só do usuário: o `remover --forcar`, que abandona uma frente sem merge e apaga o trabalho dela, e o
# `frentes.sh` com as variáveis do modo de teste (`HARNESS_TEST` e as `FRENTES_*`), que trocam o `gh`, o comando de
# ambiente e as conferências do script e fariam o `remover` remover uma frente sem o merge. O padrão olha o nome do
# script (`frentes.sh`), então vale também para o atalho que um projeto ponha na frente do núcleo. É uma guarda para um
# agente que coopera, e não uma barreira de segurança.
#
# Sai com 0 para deixar o comando rodar e com 2 para negá-lo. No 2, o que foi escrito na saída de erro volta para o agente.

set -uo pipefail

deny() {
  printf '%s\n' "$@" >&2
  exit 2
}

deny_forcar() {
  deny "O comando foi negado: só o usuário abandona uma frente com o \`--forcar\`." \
    "O \`frentes.sh remover --forcar\` remove a frente sem o merge e apaga o trabalho dela; abandonar um ticket é decisão do usuário, que a toma no prompt com \`! <o frentes.sh> remover <ticket> --forcar\`."
}

deny_test_mode() {
  deny "O comando foi negado: o \`frentes.sh\` não roda com as variáveis do modo de teste do harness." \
    "\`HARNESS_TEST\` e as \`FRENTES_*\` trocam o \`gh\`, o comando de ambiente e as conferências do script, e com elas o \`remover\` removeria uma frente sem o merge. São dos testes do script. Rode o \`frentes.sh\` sem elas."
}

# O `frentes.sh` com o `--forcar` em qualquer ponto do comando, e com uma variável do modo de teste em qualquer ponto do
# comando. Uma mensagem que cite os dois também é negada: o hook falha fechado.
forcar='frentes\.sh.*--forcar'
test_mode='(HARNESS_TEST|FRENTES_[A-Z_]+)'

# O hook recebe um JSON pela entrada padrão, com o comando em `tool_input.command`.
input="$(cat)"
# Os dois padrões precisam do nome do script: sem ele, o comando passa sem o custo do `jq`.
[[ "$input" == *frentes.sh* ]] || exit 0

# Sem conseguir ler o comando, a entrada inteira conta como ele, para a falha do `jq` não liberá-lo.
command="$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null)" || command="$input"

[[ "$command" =~ $forcar ]] && deny_forcar
[[ "$command" == *frentes.sh* && "$command" =~ $test_mode ]] && deny_test_mode
exit 0
