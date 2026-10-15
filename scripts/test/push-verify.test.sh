#!/usr/bin/env bash
#
# Testes do hook .claude/hooks/push-verify.sh nos comandos que ele nega fora do push (o `unlock` do
# scripts/verify.sh, o `CI=` ou `GITHUB_ACTIONS=` no comando dele e a pasta de estado do harness), pela entrada que o Claude Code entrega a ele (um
# JSON pela entrada padrão) e pela decisão que ele devolve (0 libera, 2 nega). O `git push` não entra:
# ele chama o `scripts/verify.sh prepush`, que confere o estado deste clone. Rodam na máquina, como o
# hook, porque ele usa o `jq`, que o contêiner `api` não tem. Quem chama é o scripts/verify.sh.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$ROOT/.claude/hooks/push-verify.sh"
# shellcheck source=sh-helpers.sh
source "$ROOT/scripts/test/sh-helpers.sh"

command -v jq >/dev/null || { echo "Falta o \`jq\` na máquina: o hook e o teste dele precisam dele."; exit 2; }

# O hook roda neste repositório, de onde lê a instrução de destravar.
export CLAUDE_PROJECT_DIR="$ROOT"

# expect <código esperado> <nome> <entrada> [trecho esperado na saída de erro]
expect() {
  expect_hook "$HOOK" "$@"
}

# A entrada do hook para a ferramenta de shell, com o comando dado.
# command_input <comando>
command_input() {
  jq -n --arg command "$1" '{tool_input: {command: $command}}'
}

# A mesma entrada, vinda de um subagente: o Claude Code acrescenta o `agent_id` dele.
# subagent_input <comando>
subagent_input() {
  jq -n --arg command "$1" '{agent_id: "a1b2c3", agent_type: "general-purpose", tool_input: {command: $command}}'
}

expect 2 "nega o full a um subagente, e diz que o full é de quem o chamou" \
  "$(subagent_input 'scripts/verify.sh full')" "o \`full\` é de quem o chamou"
expect 2 "nega a um subagente o full de algumas apps" \
  "$(subagent_input 'scripts/verify.sh full web api 2>&1 | tail -40')" "o \`full\` é de quem o chamou"
expect 2 "nega a um subagente o full embrulhado ou com o corpo do PR" \
  "$(subagent_input 'ACCEPTANCE_BODY_FILE=x timeout 900 "./scripts/verify.sh" full')" "o \`full\` é de quem o chamou"
expect 0 "libera a um subagente o modo rápido" \
  "$(subagent_input 'scripts/verify.sh fast web')"
expect 0 "libera a um subagente um comando que só cita o full" \
  "$(subagent_input 'git commit -m "roda o full no fim"')"
expect 0 "libera o full à sessão principal, que não traz o agent_id" \
  "$(command_input 'scripts/verify.sh full')"

expect 2 "nega o unlock, diz que só o usuário destrava e manda pedir o \`! scripts/verify.sh unlock\`" \
  "$(command_input 'scripts/verify.sh unlock')" "só o usuário destrava o modo completo."$'\n'"Como resolver: pare e peça ao usuário"
expect 2 "nega o unlock pelo caminho relativo, com aspas, por outro shell ou depois de outro comando" \
  "$(command_input 'cd /repo && bash "./scripts/verify.sh"   unlock')"
expect 2 "nega o unlock numa segunda linha" \
  "$(command_input $'echo oi\nscripts/verify.sh unlock 2>&1')"
expect 0 "libera os outros modos do verify.sh" \
  "$(command_input 'scripts/verify.sh full && scripts/verify.sh fast web')"
expect 0 "libera um comando que só cita a palavra unlock" \
  "$(command_input 'git commit -m "documenta o unlock da trava"')"
expect 2 "nega o unlock embrulhado no timeout" \
  "$(command_input 'timeout 900 scripts/verify.sh unlock')" "só o usuário destrava"
expect 2 "nega o unlock embrulhado no nohup" \
  "$(command_input 'nohup scripts/verify.sh unlock &')" "só o usuário destrava"
expect 2 "nega o unlock embrulhado no command" \
  "$(command_input 'command scripts/verify.sh unlock')" "só o usuário destrava"
expect 2 "nega o unlock dentro do bash -c" \
  "$(command_input "bash -c 'scripts/verify.sh unlock'")" "só o usuário destrava"
expect 2 "nega o unlock dentro do eval" \
  "$(command_input 'eval "scripts/verify.sh unlock"')" "só o usuário destrava"
expect 2 "nega o unlock dentro de um if" \
  "$(command_input 'if true; then scripts/verify.sh unlock; fi')" "só o usuário destrava"
expect 2 "nega também a mensagem que cita o verify.sh e o unlock, porque o hook falha fechado" \
  "$(command_input 'git commit -m "peça ao usuário o scripts/verify.sh unlock"')" "só o usuário destrava"
expect 2 "nega a entrada ilegível que cita o verify.sh e o unlock" \
  "isto não é json scripts/verify.sh unlock" "só o usuário destrava"

expect 2 "nega apagar a trava na pasta de estado do harness, e diz que o estado é da verificação" \
  "$(command_input 'rm .git/harness/full-lock')" "o estado é da verificação"
expect 2 "nega mexer na aprovação do modo completo por outro caminho" \
  "$(command_input 'cp /tmp/x "$(git rev-parse --show-toplevel)/.git/harness/full-ok"')" "o estado é da verificação"
expect 2 "nega o arquivo da trava sem o .git no caminho" \
  "$(command_input 'cd .git && rm harness/full-lock')" "o estado é da verificação"
expect 2 "nega a pasta de estado pelo git rev-parse --git-dir" \
  "$(command_input 'rm -rf "$(git rev-parse --git-dir)/harness"')" "o estado é da verificação"
expect 2 "nega a entrada ilegível que cita a pasta de estado" \
  "isto não é json rm .git/harness/full-lock" "o estado é da verificação"

expect 2 "nega o verify.sh com CI= na frente, e diz que a variável desligaria a trava" \
  "$(command_input 'CI=true scripts/verify.sh full')" "desligariam a trava"
expect 2 "nega o verify.sh com GITHUB_ACTIONS= exportado antes" \
  "$(command_input 'export GITHUB_ACTIONS=true; scripts/verify.sh full')" "desligariam a trava"
expect 2 "nega o verify.sh com CI= pelo env" \
  "$(command_input 'env CI=1 ./scripts/verify.sh full')" "desligariam a trava"
expect 2 "nega o verify.sh com CI= na frente de um embrulho" \
  "$(command_input 'CI=1 timeout 900 scripts/verify.sh full')" "desligariam a trava"
expect 2 "nega o CI= dentro do bash -c que roda o verify.sh" \
  "$(command_input "bash -c 'CI=1 scripts/verify.sh full'")" "desligariam a trava"
expect 0 "libera o verify.sh com um CI= que é só texto entre aspas, como o padrão do grep" \
  "$(command_input "scripts/verify.sh full 2>&1 | grep 'CI='")"
expect 0 "libera o CI= dentro da mensagem de um commit antes do verify.sh" \
  "$(command_input "git commit -m 'set CI= in workflow' && scripts/verify.sh full")"
expect 0 "libera o verify.sh sem as variáveis da CI, mesmo com outras na frente" \
  "$(command_input 'ACCEPTANCE_BODY_FILE=docs/tickets/LUI-100/LUI-1/pr.md MY_CI=1 scripts/verify.sh full')"
expect 0 "libera o CI= num comando que não roda o verify.sh" \
  "$(command_input 'CI=true npx playwright test')"
expect 2 "nega a entrada ilegível que cita o verify.sh e o CI=" \
  "isto não é json CI=true scripts/verify.sh full" "desligariam a trava"

expect 0 "libera um comando qualquer" "$(command_input 'git status --short')"

finish "do hook"
