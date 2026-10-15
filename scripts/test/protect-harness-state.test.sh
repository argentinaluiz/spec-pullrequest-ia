#!/usr/bin/env bash
#
# Testes do hook .claude/hooks/protect-harness-state.sh, que nega às ferramentas de edição de arquivo
# qualquer caminho dentro da pasta de estado do harness (`.harness/`), pela entrada que o Claude Code
# entrega a ele (um JSON pela entrada padrão) e pela decisão que ele devolve (0 libera, 2 nega). Rodam
# na máquina, como o hook, porque ele usa o `jq`, que o contêiner `api` não tem. Quem chama é o
# scripts/verify.sh.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$ROOT/.claude/hooks/protect-harness-state.sh"
# shellcheck source=sh-helpers.sh
source "$ROOT/scripts/test/sh-helpers.sh"

command -v jq >/dev/null || { echo "Falta o \`jq\` na máquina: o hook e o teste dele precisam dele."; exit 2; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
project="$work/projeto"
mkdir -p "$project"
project="$(cd "$project" && pwd -P)"
mkdir -p "$project/apps" "$project/.harness"
# O hook roda no projeto temporário, e nunca na pasta de estado de verdade.
export CLAUDE_PROJECT_DIR="$project"

# expect <código esperado> <nome> <JSON da entrada> [trecho esperado na saída de erro]
expect() {
  expect_hook "$HOOK" "$@"
}

expect 2 "nega o Write de um arquivo dentro da pasta de estado, e diz que o estado é da verificação" \
  "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$project/.harness/x\"}}" "o estado é da verificação"
expect 2 "nega o Edit da aprovação do modo completo" \
  "{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$project/.harness/full-ok\"}}" "o estado é da verificação"
expect 2 "nega o MultiEdit da trava" \
  "{\"tool_name\":\"MultiEdit\",\"tool_input\":{\"file_path\":\"$project/.harness/full-lock\",\"edits\":[]}}" "o estado é da verificação"
expect 2 "nega o NotebookEdit dentro da pasta de estado" \
  "{\"tool_name\":\"NotebookEdit\",\"tool_input\":{\"notebook_path\":\"$project/.harness/n.ipynb\"}}" "o estado é da verificação"
expect 2 "nega o caminho relativo" \
  "{\"tool_input\":{\"file_path\":\".harness/x\"}}" "o estado é da verificação"
expect 2 "nega o caminho que chega à pasta de estado por um \`..\`" \
  "{\"tool_input\":{\"file_path\":\"$project/apps/../.harness/x\"}}" "o estado é da verificação"
expect 2 "nega o caminho com \`./\` e barras repetidas" \
  "{\"tool_input\":{\"file_path\":\"$project/./.harness//sub/x\"}}" "o estado é da verificação"
expect 2 "nega o arquivo novo numa subpasta ainda inexistente da pasta de estado" \
  "{\"tool_input\":{\"file_path\":\"$project/.harness/novo/fundo/x\"}}" "o estado é da verificação"
expect 2 "nega a entrada ilegível que cita a pasta de estado" \
  "isto não é json .harness/x" "o estado é da verificação"
expect 0 "libera um arquivo de apps/" \
  "{\"tool_input\":{\"file_path\":\"$project/apps/a.ts\"}}"
expect 0 "libera um arquivo da raiz" \
  "{\"tool_input\":{\"file_path\":\"$project/README.md\"}}"
expect 0 "libera um nome parecido com o da pasta de estado" \
  "{\"tool_input\":{\"file_path\":\"$project/.harness-notes.md\"}}"
expect 0 "libera um arquivo chamado harness.md numa pasta de documentos" \
  "{\"tool_input\":{\"file_path\":\"$project/docs/harness.md\"}}"
expect 0 "libera uma pasta .harness fora da raiz do projeto, em apps/" \
  "{\"tool_input\":{\"file_path\":\"$project/apps/.harness/x\"}}"
expect 0 "libera a entrada ilegível que não cita a pasta de estado" \
  "isto não é json apps/a.ts"

# O caminho relativo vale a partir do `cwd` da entrada, que a sessão pode ter mudado.
mkdir -p "$project/apps/api"
expect 2 "nega o caminho relativo com \`..\`, a partir do cwd da entrada" \
  "{\"cwd\":\"$project/apps/api\",\"tool_input\":{\"file_path\":\"../../.harness/full-lock\"}}" "o estado é da verificação"
expect 0 "libera .harness/x a partir de apps/api, que é a apps/api/.harness" \
  "{\"cwd\":\"$project/apps/api\",\"tool_input\":{\"file_path\":\".harness/x\"}}"
expect 2 "nega o caminho relativo da raiz quando o cwd é a raiz" \
  "{\"cwd\":\"$project\",\"tool_input\":{\"file_path\":\".harness/x\"}}" "o estado é da verificação"
expect 2 "nega o nome em maiúsculas, para um sistema de arquivos que ignora a caixa" \
  "{\"tool_input\":{\"file_path\":\".HARNESS/full-ok\"}}" "o estado é da verificação"
expect 2 "nega o nome em maiúsculas com o caminho absoluto" \
  "{\"tool_input\":{\"file_path\":\"$project/.Harness/full-ok\"}}" "o estado é da verificação"
expect 0 "libera a entrada sem arquivo (outra ferramenta) que cita a pasta de estado no texto" \
  "{\"tool_input\":{\"content\":\"a pasta .harness guarda a trava\"}}"

# Falha fechada: sem `jq` ou sem `realpath`, o hook não consegue conferir, e nega.
without() {
  local bin="$work/bin-sem-$1" tool
  mkdir -p "$bin"
  for tool in env bash cat dirname realpath jq pwd; do
    [[ "$tool" == "$1" ]] && continue
    ln -sf "$(command -v "$tool")" "$bin/$tool"
  done
  echo "$bin"
}
for tool in jq realpath; do
  bin="$(without "$tool")"
  err="$(/usr/bin/env PATH="$bin" "$HOOK" <<<"{\"tool_input\":{\"file_path\":\"$project/apps/a.ts\"}}" 2>&1 >/dev/null)"
  code=$?
  check "sem o \`$tool\`, o hook nega e diz que não conseguiu conferir" \
    bash -c '[[ "$1" == 2 && "$2" == *"não foi possível conferir"* ]]' _ "$code" "$err"
done
# Sem a raiz do projeto, também nega.
err="$(CLAUDE_PROJECT_DIR="$work/nao-existe" "$HOOK" <<<"{\"tool_input\":{\"file_path\":\"a.ts\"}}" 2>&1 >/dev/null)"
code=$?
check "sem a raiz do projeto, o hook nega e diz que não conseguiu conferir" \
  bash -c '[[ "$1" == 2 && "$2" == *"não foi possível conferir"* ]]' _ "$code" "$err"

finish "do hook"
