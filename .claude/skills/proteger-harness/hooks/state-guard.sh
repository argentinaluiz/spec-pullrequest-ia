#!/usr/bin/env bash
#
# Hook de antes do comando do Claude Code (evento PreToolUse, ferramenta Bash). Nega ao agente o
# comando de shell que mexe na pasta de estado do harness (`.harness/`), onde a verificação guarda a
# trava e a aprovação dela: o estado é da verificação, e não do agente. A leitura do que é mexer na
# pasta, com as aspas, as expansões, os heredocs e os interpretadores, é de scripts/harness-state-guard.sh.
# É uma guarda para um agente que coopera, e não uma barreira de segurança.
#
#   state-guard.sh [--ajuda <texto>]
#
# O `--ajuda` é a frase que a mensagem de negação acrescenta no fim, e é de quem configura o hook (o
# projeto diz, por exemplo, quem destrava a verificação), porque a skill não conhece o comando dele.
#
# Sai com 0 para deixar o comando rodar e com 2 para negá-lo. No 2, o que foi escrito na saída de
# erro volta para o agente.

set -uo pipefail

help_text=""
if [[ "${1:-}" == --ajuda ]]; then
  help_text="${2:-}"
fi

# shellcheck source=../scripts/harness-state-guard.sh
source "$(dirname "${BASH_SOURCE[0]}")/../scripts/harness-state-guard.sh"

deny_state() {
  {
    echo "O comando foi negado: a pasta de estado do harness (\`.harness/\`) guarda a trava e a aprovação da verificação, e o estado é da verificação, não do agente."
    echo "Não leia, não apague e não grave nada nela: quem mexe nesse estado é a própria verificação.${help_text:+ $help_text}"
  } >&2
  exit 2
}

# O hook recebe um JSON pela entrada padrão, com o comando em `tool_input.command`.
input="$(cat)"

# Sem conseguir ler o comando, qualquer citação da pasta conta, para a falha do `jq` não liberá-lo.
if ! command="$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null)"; then
  harness_state_in_raw "$input" && deny_state
  exit 0
fi

harness_state_touched "$command" && deny_state
exit 0
