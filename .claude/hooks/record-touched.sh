#!/usr/bin/env bash
#
# Hook do Claude Code (evento PostToolUse, ferramentas de edição de arquivo). Anota, por sessão, os
# arquivos de apps/ que o agente editou, para o hook de fim de turno (stop-verify.sh) bloquear só
# pelos erros desses arquivos. Um subagente traz o mesmo `session_id` da sessão que o chamou, então
# as edições dele caem no arquivo dela. Edição por shell (sed, mv, gerador) não passa por aqui: é
# um limite aceito, e o modo completo confere a árvore inteira. O desenho está no docs/harness.md,
# seção "Hook de fim de turno".
#
# O `session_id` entra no nome do arquivo de estado, então só vale com letras, dígitos, `_` e `-`.
# Com outro formato, ou sem `jq`, o hook não anota nada, e o hook de fim de turno avisa que não
# conseguiu atribuir a sessão.
#
# Nunca bloqueia nem falha a ferramenta: sai sempre com 0.

set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" 2>/dev/null || exit 0
root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0

# A primeira linha é a sessão (vazia se não for válida), e as seguintes são os arquivos que a chamada editou.
input="$(jq -r '((.session_id | select(type == "string" and test("\\A[A-Za-z0-9_-]+\\z"))) // ""), ([.tool_input.file_path, (.tool_input.edits[]?.file_path)] | map(select(type == "string")) | .[])' 2>/dev/null)" || exit 0
session="${input%%$'\n'*}"
[[ "$session" =~ ^[A-Za-z0-9_-]+$ && "$input" == *$'\n'* ]] || exit 0

state_dir="$(git rev-parse --absolute-git-dir 2>/dev/null)/harness" || exit 0
record="$state_dir/touched-$session"

while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  # Normaliza para a forma que as ferramentas imprimem: sem `/./` nem `//`, sem `./` no começo e
  # relativo à raiz do repositório. Fora dela, ou fora de apps/, não conta.
  while [[ "$file" == *"/./"* ]]; do file="${file//\/.\//\/}"; done
  while [[ "$file" == *"//"* ]]; do file="${file//\/\//\/}"; done
  file="${file#./}"
  file="${file#"$root"/}"
  file="${file#"${CLAUDE_PROJECT_DIR:-$root}"/}"
  # Só um segmento `..` é travessia: `foo..bar.ts` é um nome válido.
  [[ "$file" == apps/* && "/$file/" != */../* ]] || continue
  mkdir -p "$state_dir" 2>/dev/null || exit 0
  grep -qxF -- "$file" "$record" 2>/dev/null || printf '%s\n' "$file" >>"$record" 2>/dev/null
done < <(printf '%s\n' "${input#*$'\n'}")

exit 0
