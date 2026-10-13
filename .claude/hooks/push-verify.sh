#!/usr/bin/env bash
#
# Hook de antes do push do Claude Code (evento PreToolUse, ferramenta Bash). Quando o agente vai
# rodar um `git push`, confere com o scripts/verify.sh prepush se os commits não trazem segredo e
# se o modo completo aprovou o que está no último commit. Se não, nega o comando. O desenho está
# no docs/harness.md.
#
# Sai com 0 para deixar o comando rodar e com 2 para negá-lo. No 2, o que foi escrito na saída de
# erro volta para o agente.

set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0

# O hook recebe um JSON pela entrada padrão, com o comando em `tool_input.command`. Se o `jq`
# falhar, a busca é feita no JSON inteiro, para a falta dele não liberar o push.
input="$(cat)"
command="$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null)" || command="$input"

# `git push` como comando: no começo de uma linha ou depois de `;`, `&`, `|` ou `(`, com
# variáveis de ambiente na frente, as opções globais do `git` (`-C <pasta>`, `-c <chave=valor>`,
# `--no-pager`) e então `push`. Não casa com `git stash push` nem com um texto que só cite o
# comando no meio de uma frase, como a mensagem de um commit.
git_push=$'(^|[;&|(\n])[[:space:]]*([[:alnum:]_]+=[^[:space:]]*[[:space:]]+)*git([[:space:]]+(-[Cc][[:space:]]+[^[:space:]]+|--?[[:alnum:]-]+(=[^[:space:]]+)?))*[[:space:]]+push([^[:alnum:]_-]|$)'
[[ "$command" =~ $git_push ]] || exit 0

# Apagar uma branch remota não envia código.
[[ "$command" =~ [[:space:]]--delete([[:space:]]|$) ]] && exit 0

output="$(scripts/verify.sh prepush 2>&1)" && exit 0

{
  echo "O push foi negado: a verificação de antes do push não passou."
  echo "Não contorne o bloqueio. Se o push sem verificação for mesmo necessário, quem o faz é o usuário, no terminal."
  echo
  echo "$output" | tail -n 40
} >&2
exit 2
