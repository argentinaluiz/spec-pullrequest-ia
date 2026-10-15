#!/usr/bin/env bash
#
# Hook de antes da edição do Claude Code (evento PreToolUse, ferramentas de edição de arquivo). A
# pasta de estado do harness (`.harness/`, na raiz do checkout) guarda a trava e as aprovações do
# modo completo, e o estado é da verificação, não do agente: quando o agente vai gravar um arquivo
# dentro dela, nega a edição. É a metade do bloqueio que cabe às ferramentas de arquivo; a do shell é
# do push-verify.sh. Os scripts e os hooks gravam nela como processos, sem passar por aqui, e a leitura
# não é negada. O caminho relativo vale a partir do `cwd` da entrada, a comparação ignora a caixa, e a
# falha em conferir (sem `jq` ou `realpath`, ou sem a raiz do projeto) nega, em vez de liberar. A
# guarda é para um agente que coopera, e não uma barreira de segurança. O desenho e os limites estão
# no docs/harness.md, seção "Pasta de estado do harness".
#
# Sai com 0 para deixar a edição rodar e com 2 para negá-la. No 2, o que foi escrito na saída de
# erro volta para o agente.

set -uo pipefail

deny() {
  {
    echo "A edição foi negada: a pasta de estado do harness (\`.harness/\`) guarda a trava e a aprovação do modo completo, e o estado é da verificação, não do agente."
    echo "Quem mexe nesse estado é o scripts/verify.sh. Não contorne o bloqueio: se o modo completo travou, peça ao usuário que examine a falha e rode \`! scripts/verify.sh unlock\` no prompt."
  } >&2
  exit 2
}

# Sem conseguir conferir, nega: liberar na dúvida abriria a guarda.
deny_unchecked() {
  echo "A edição foi negada: não foi possível conferir o caminho ($1), e o hook nega o que não confere." >&2
  exit 2
}

for tool in jq realpath; do
  command -v "$tool" >/dev/null 2>&1 || deny_unchecked "falta o \`$tool\` na máquina"
done

# shellcheck source=../../scripts/harness-dir.sh
source "${0%/*}/../../scripts/harness-dir.sh"
# shellcheck source=../../scripts/harness-state-guard.sh
source "${0%/*}/../../scripts/harness-state-guard.sh"
[[ -n "$HARNESS_DIR" ]] || deny_unchecked "a raiz do projeto não se alcança"
root="${HARNESS_DIR%/.harness}"

# O hook recebe um JSON pela entrada padrão, com o arquivo em `tool_input.file_path` (ou em
# `tool_input.notebook_path`, no NotebookEdit) e a pasta atual da sessão em `cwd`.
input="$(cat)"

# O `jq` falhar é entrada ilegível: sem poder ler o arquivo, qualquer menção à pasta de estado conta
# como edição dela, para a falha não liberar a edição.
if ! file="$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input" 2>/dev/null)"; then
  harness_state_in_raw "${input,,}" && deny
  exit 0
fi
# Sem arquivo (outra ferramenta), não há o que conferir.
[[ -n "$file" ]] || exit 0

# A pasta atual da sessão, de onde um caminho relativo vale; sem ela, a raiz do projeto.
cwd="$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null)"
[[ "$cwd" == /* ]] || cwd="$root"

# O caminho a partir da raiz do checkout, sem `..` nem caminho absoluto, e em minúsculas, para um
# sistema de arquivos que ignora a caixa. Os links simbólicos que existem são resolvidos.
target="$file"
[[ "$file" == /* ]] || target="$cwd/$file"
relative="$(realpath -m --relative-to="$root" -- "$target" 2>/dev/null)" || deny_unchecked "o \`realpath\` falhou"
relative="${relative,,}"
[[ "$relative" =~ ^\.harness(/|$) ]] && deny
exit 0
