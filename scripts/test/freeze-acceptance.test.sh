#!/usr/bin/env bash
#
# Testes do hook .claude/hooks/freeze-acceptance.sh, pela entrada que o Claude Code entrega a ele
# (um JSON pela entrada padrão) e pela decisão que ele devolve (0 libera, 2 nega). Rodam na máquina,
# como o hook, porque ele usa o `git` e o `jq`, que o contêiner `api` não tem. Quem chama é o
# scripts/verify.sh.

set -uo pipefail
HOOK="$(cd "$(dirname "$0")/../.." && pwd)/.claude/hooks/freeze-acceptance.sh"

for tool in git jq; do
  command -v "$tool" >/dev/null || { echo "Falta o \`$tool\` na máquina: o hook e o teste dele precisam dele."; exit 2; }
done

project="$(mktemp -d)"
trap 'rm -rf "$project"' EXIT
git -C "$project" init -q
git -C "$project" config user.email t@t
git -C "$project" config user.name t
mkdir -p "$project/docs/aceite" "$project/apps"
echo congelado >"$project/docs/aceite/LUI-1.md"
echo x >"$project/apps/a.ts"
git -C "$project" add -A
git -C "$project" -c commit.gpgsign=false -c core.hooksPath=/dev/null commit -q -m plano || exit 2

failed=0
# expect <código esperado> <nome> <JSON da entrada> [trecho esperado na saída de erro]
expect() {
  local want="$1" name="$2" input="$3" text="${4:-}" got err
  err="$(CLAUDE_PROJECT_DIR="$project" "$HOOK" <<<"$input" 2>&1 >/dev/null)"
  got=$?
  if [[ $got -ne $want || "$err" != *"$text"* ]]; then
    echo "FALHOU: $name (saída $got, esperava $want; erro: $err)"
    failed=$((failed + 1))
  else
    echo "ok: $name"
  fi
}

expect 2 "nega a edição de um arquivo de aceite já versionado, e diz que descongelar é do usuário" \
  "{\"tool_input\":{\"file_path\":\"$project/docs/aceite/LUI-1.md\"}}" "Descongelar é do usuário"
expect 0 "libera a criação de um arquivo de aceite novo" \
  "{\"tool_input\":{\"file_path\":\"$project/docs/aceite/LUI-2.md\"}}"
expect 0 "libera a edição de um arquivo fora da pasta de aceite" \
  "{\"tool_input\":{\"file_path\":\"$project/apps/a.ts\"}}"
expect 2 "nega o caminho que chega ao arquivo versionado por um \`..\`" \
  "{\"tool_input\":{\"file_path\":\"$project/apps/../docs/aceite/LUI-1.md\"}}"
expect 2 "nega a entrada ilegível que cita a pasta de aceite" \
  "isto não é json docs/aceite/LUI-1.md"
expect 0 "libera a entrada ilegível que não cita a pasta de aceite" \
  "isto não é json apps/a.ts"

[[ $failed -eq 0 ]] || { echo "$failed teste(s) do hook falharam."; exit 1; }
