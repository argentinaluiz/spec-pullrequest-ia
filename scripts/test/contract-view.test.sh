#!/usr/bin/env bash
#
# Teste do comando da visão do contrato (scripts/contract-view.sh): o comando roda numa cópia dos scripts num repositório
# temporário, com o `docker` trocado por um falso (o oasdiff e o Node no contêiner respondem o que o caso combinou), então
# nenhum contêiner entra no caso. Roda na máquina. O caso leva a tag do critério de aceite no nome.

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
# shellcheck source=../../.claude/skills/__tests__/helpers.sh
source "$ROOT/.claude/skills/__tests__/helpers.sh"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
repo="$tmp/repo"
mkdir -p "$tmp/bin" "$repo/scripts" "$repo/apps/api/prisma"
cp "$ROOT"/scripts/contract-*.sh "$ROOT/scripts/contract-view.cjs" "$ROOT/scripts/node-in-api.sh" "$repo/scripts/"
# O diff legível que o contract-lib.sh carrega, da skill de plano.
mkdir -p "$repo/.claude/skills/plan-ticket/scripts"
cp "$ROOT/.claude/skills/plan-ticket/scripts/plan-git.sh" "$repo/.claude/skills/plan-ticket/scripts/"
# Os valores do contrato que o contract-lib.sh lê: o snapshot e o schema, nessa ordem, e o comando do Node.
mkdir -p "$repo/.config"
printf '[contrato]\n\tarquivos = apps/api/openapi.json apps/api/prisma/schema.prisma\n[node]\n\tcomando = scripts/node-in-api.sh\n' \
  >"$repo/.config/project"

# O `docker` falso: o oasdiff (`run`) responde o changelog; o Node no contêiner (`compose ... exec ... node`) grava a entrada
# que recebeu e imprime o Markdown de mentira; `exec api true` diz se o contêiner está no ar (FAKE_UP).
cat >"$tmp/bin/docker" <<'FAKE'
#!/usr/bin/env bash
args="$*"
case "$args" in
  *" exec -T -w /repo api node "*)
    cat >"$FAKE_DIR/stdin"
    printf '# Contrato\n\nRENDERIZADO\n\n# Schema\n\nDIFF DO SCHEMA\n'
    ;;
  *" exec -T api true") exit "${FAKE_UP:-0}" ;;
  *" changelog "*)
    [[ -n "${FAKE_CHANGELOG_FAIL:-}" ]] && { echo "erro do oasdiff" >&2; exit 1; }
    echo "CHANGELOG DO OASDIFF"
    ;;
esac
exit 0
FAKE
chmod +x "$tmp/bin/docker"
export FAKE_DIR="$tmp" PATH="$tmp/bin:$PATH"

git -C "$repo" init -q -b main
git -C "$repo" config user.email t@t
git -C "$repo" config user.name t
printf '{"openapi":"3.0.0","info":{"title":"a","version":"1"},"paths":{}}\n' >"$repo/apps/api/openapi.json"
printf 'model A {}\n' >"$repo/apps/api/prisma/schema.prisma"
git -C "$repo" add -A && git -C "$repo" commit -q -m base
printf '{"openapi":"3.0.0","info":{"title":"a","version":"1"},"paths":{"/x":{}}}\n' >"$repo/apps/api/openapi.json"
printf 'model A {}\nmodel B {}\n' >"$repo/apps/api/prisma/schema.prisma"

# view <argumentos...>: roda o comando no repositório temporário; deixa a saída em $out e o código em $code.
view() {
  out="$(cd "$repo" && scripts/contract-view.sh "$@" 2>&1)"
  code=$?
}

name="a visão do contrato é montada pelo comando do /contrato e recusa o ponto que não existe @LUI-197-CA1"

view HEAD
check "$name: imprime os dois pontos e o Markdown do renderizador, e sai com 0" \
  bash -c '[[ $1 -eq 0 && $2 == "Contrato e schema de HEAD para a pasta de trabalho."* && $2 == *"RENDERIZADO"* && $2 == *"DIFF DO SCHEMA"* ]]' _ "$code" "$out"
pairs="$(tr '\0' '|' <"$tmp/stdin")"
check "$name: entrega ao renderizador os dois snapshots, o changelog e o diff do schema, pela entrada padrão" \
  bash -c '[[ $1 == base\|*\"paths\":{}*\|novo\|*\"/x\"*\|changelog\|*CHANGELOG*\|schemaDiff\|*+model\ B* ]]' _ "$pairs"

view HEAD HEAD
check "$name: com os dois pontos iguais, não há changelog" bash -c '[[ $1 -eq 0 && $2 != *"CHANGELOG"* ]]' _ "$code" "$out"

view naoexiste
check "$name: recusa um ponto que não é commit nem árvore, e diz como passar um" \
  bash -c '[[ $1 -eq 2 && $2 == *"não é um commit nem o id da árvore"* && $2 == *"git write-tree"* ]]' _ "$code" "$out"

FAKE_UP=1 view HEAD
check "$name: com o contêiner fora do ar, sai com 2 e diz como subir o ambiente" \
  bash -c '[[ $1 -eq 2 && $2 == *"não está no ar"* && $2 == *"up -d --build --wait"* ]]' _ "$code" "$out"

FAKE_CHANGELOG_FAIL=1 view HEAD
check "$name: com um snapshot que o oasdiff não lê, sai com 1 e diz que a visão não pôde ser montada" \
  bash -c '[[ $1 -eq 1 && $2 == *"visão do contrato não pôde ser montada"* ]]' _ "$code" "$out"

finish "do comando da visão do contrato"
