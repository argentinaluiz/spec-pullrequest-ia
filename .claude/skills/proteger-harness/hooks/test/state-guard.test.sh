#!/usr/bin/env bash
#
# Testes do hook do estado (hooks/state-guard.sh): o que ele nega num comando de shell que lê, grava ou
# apaga na pasta de estado do harness, pela entrada que o Claude Code entrega a ele (um JSON pela
# entrada padrão) e pela decisão que ele devolve (0 libera, 2 nega). Rodam na máquina, como o hook, porque
# ele usa o `jq`, que o contêiner `api` não tem. Os casos levam a tag do critério de aceite no nome.

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
HOOK="$HERE/../state-guard.sh"
# shellcheck source=../../scripts/test/helpers.sh
source "$HERE/../../scripts/test/helpers.sh"

command -v jq >/dev/null || { echo "Falta o \`jq\` na máquina: o hook e o teste dele precisam dele."; exit 2; }

# A ajuda que o projeto passa na linha de comando do hook, e que a mensagem de negação repete.
HELP="peça ao dono da verificação (ajuda de teste)"
HOOK_ARGS=(--ajuda "$HELP")

# expect <código esperado> <nome> <entrada> [trecho esperado na saída de erro]
expect() {
  expect_hook "$HOOK" "$@"
}

# A entrada do hook para a ferramenta de shell, com o comando dado.
# command_input <comando>
command_input() {
  jq -n --arg command "$1" '{tool_input: {command: $command}}'
}

expect 2 "nega apagar a trava na pasta de estado do harness, e diz que o estado é da verificação @LUI-194-CA4" \
  "$(command_input 'rm .harness/full-lock')" "o estado é da verificação"
expect 2 "nega mexer na aprovação do modo completo por outro caminho @LUI-194-CA4" \
  "$(command_input 'cp /tmp/x "$(git rev-parse --show-toplevel)/.harness/full-ok"')" "o estado é da verificação"
expect 2 "nega a pasta de estado montada pela raiz do repositório, em um trecho com espaços @LUI-194-CA4" \
  "$(command_input 'cat "$(git rev-parse --show-toplevel)/.harness/full-lock"')" "o estado é da verificação"
expect 2 "nega ler a aprovação do modo completo @LUI-194-CA4" \
  "$(command_input 'cat .harness/full-ok')" "o estado é da verificação"
expect 2 "nega apagar a pasta de estado inteira, sem barra no fim @LUI-194-CA4" \
  "$(command_input 'rm -rf .harness')" "o estado é da verificação"
expect 2 "nega a pasta de estado entre aspas @LUI-194-CA4" \
  "$(command_input 'ls "./.harness"')" "o estado é da verificação"
expect 2 "nega a pasta de estado seguida de um arquivo, escrita por redirecionamento @LUI-194-CA4" \
  "$(command_input 'echo x > ./.harness/full-ok')" "o estado é da verificação"
expect 2 "nega a pasta de estado entre aspas, sozinha @LUI-194-CA4" \
  "$(command_input 'rm -rf ".harness"')" "o estado é da verificação"
expect 2 "nega a pasta de estado montada pela raiz do repositório, fora das aspas @LUI-194-CA4" \
  "$(command_input 'rm $(git rev-parse --show-toplevel)/.harness/full-lock')" "o estado é da verificação"
expect 2 "nega a pasta de estado dentro do bash -c @LUI-194-CA4" \
  "$(command_input "bash -c 'rm -rf .harness'")" "o estado é da verificação"
expect 2 "nega a pasta de estado antiga, que também guardava a trava @LUI-194-CA4" \
  "$(command_input 'rm .git/harness/full-lock')" "o estado é da verificação"
expect 0 "libera um arquivo full- que não é da pasta de estado @LUI-194-CA4" \
  "$(command_input 'cd somewhere && rm harness/full-lock')"
expect 0 "libera a mensagem de commit que cita a pasta de estado @LUI-194-CA4" \
  "$(command_input 'git commit -m "state moved to .harness/"')"
expect 0 "libera a mensagem de commit em heredoc que cita a pasta de estado @LUI-194-CA4" \
  "$(command_input $'git commit -m "$(cat <<\'EOF\'\nfix: o estado vai para .harness/full-ok\n\nmais texto sobre .harness\nEOF\n)"')"
expect 0 "libera o corpo do PR, entre aspas simples, que cita a pasta de estado @LUI-194-CA4" \
  "$(command_input "gh pr create --title 'x' --body 'a pasta .harness guarda a trava (.harness/full-lock)'")"
expect 0 "libera o padrão de um grep que cita a pasta de estado @LUI-194-CA4" \
  "$(command_input 'grep -rn "the .harness folder" docs')"
expect 0 "libera o ponto escapado de um padrão de busca @LUI-194-CA4" \
  "$(command_input 'grep -rn "\.harness" docs')"
expect 2 "nega a entrada ilegível que cita a pasta de estado @LUI-194-CA4" \
  "isto não é json rm .harness/full-lock" "o estado é da verificação"
expect 0 "libera o ls -a, que não cita a pasta de estado @LUI-194-CA4" \
  "$(command_input 'ls -a')"
expect 0 "libera nomes parecidos, que não são a pasta de estado @LUI-194-CA4" \
  "$(command_input 'ls docs/lld.md scripts/harness-guard.sh my.harness-x .harnessrc')"

expect 2 "a mensagem de negação traz a ajuda que a linha de comando do hook passou @LUI-194-CA4" \
  "$(command_input 'rm .harness/full-lock')" "$HELP"
HOOK_ARGS=()
expect 2 "sem o --ajuda, nega do mesmo jeito e sem frase a mais @LUI-194-CA4" \
  "$(command_input 'rm .harness/full-lock')" "o estado é da verificação"
expect 0 "libera um comando qualquer @LUI-194-CA4" "$(command_input 'git status --short')"

finish "do hook do estado"
