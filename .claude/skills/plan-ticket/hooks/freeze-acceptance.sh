#!/usr/bin/env bash
#
# Hook de antes da edição do Claude Code (evento PreToolUse, ferramentas de edição de arquivo).
# O arquivo de aceite de um ticket fica congelado depois do commit de plano: quando o agente vai
# editar o `aceite.md` de um ticket que já está em commit, em qualquer pasta, nega a edição. Criar um arquivo
# de aceite novo e editar qualquer outro arquivo, inclusive os outros da pasta do ticket (o mapa de testes é
# um deles), continuam liberados.
#
#   freeze-acceptance.sh
#
# O hook não depende de onde o projeto guarda os tickets: o arquivo de aceite de um ticket é o `aceite.md` numa pasta
# com a forma do identificador do ticket (`PREFIXO-N`, como `PROJ-123`), como diz o formato da skill de plano
# (formatos/aceite.md). Por isso uma configuração que falta, ou que aponta outra pasta, não desliga o congelamento, e o
# próprio formato, que também se chama `aceite.md`, fica livre.
#
# Sai com 0 para deixar a edição rodar e com 2 para negá-la. No 2, o que foi escrito na saída de
# erro volta para o agente.

set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../../../..}" || exit 0

# O hook recebe um JSON pela entrada padrão, com o arquivo em `tool_input.file_path` (ou em
# `tool_input.notebook_path`, no NotebookEdit). Ele a lê antes de tudo, mesmo quando sai sem conferir nada.
input="$(cat)"

deny() {
  {
    echo "A edição foi negada: $1 está congelado desde o commit de plano."
    echo "Descongelar é do usuário, no editor ou no terminal. Não contorne o bloqueio: se o critério mudou de verdade, peça ao usuário que edite o arquivo de aceite."
  } >&2
  exit 2
}

# O aceite de um ticket: o `aceite.md` na pasta com a forma do identificador do ticket.
ACCEPTANCE_RE='[A-Z][A-Z0-9]*-[0-9]+/aceite\.md'

file="$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input" 2>/dev/null)" || file=""

# Sem conseguir ler o arquivo, qualquer menção ao aceite de um ticket conta como edição de aceite
# versionado, para a falha do `jq` não liberar a edição.
if [[ -z "$file" ]]; then
  [[ "$input" =~ $ACCEPTANCE_RE ]] && deny "o arquivo de aceite citado na entrada"
  exit 0
fi

# O caminho a partir da raiz do projeto, sem `..` nem caminho absoluto.
# Se o caminho não pode ser normalizado, vale a mesma regra da entrada ilegível.
relative="$(realpath -m --relative-to="$PWD" -- "$file" 2>/dev/null)" || {
  [[ "$file" =~ $ACCEPTANCE_RE ]] && deny "o arquivo de aceite citado na entrada"
  exit 0
}
[[ "$relative" =~ (^|/)$ACCEPTANCE_RE$ ]] || exit 0

# Só o que já está em commit está congelado: o arquivo novo do plano em andamento é liberado.
git cat-file -e "HEAD:$relative" 2>/dev/null && deny "$relative"
exit 0
