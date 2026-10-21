#!/usr/bin/env bash
#
# Teste do comando do desvio do contrato (.claude/skills/contrato/scripts/contract-drift.sh): o desvio desde o commit de plano, que só avisa. O
# comando roda numa cópia da skill num repositório temporário, com o `docker` trocado por um falso (o oasdiff compara os
# snapshots como o caso combinou, e o Node no contêiner devolve o Markdown de mentira), então nenhum contêiner entra no
# caso. Roda na máquina. O caso leva a tag do critério de aceite no nome.

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../../.." && pwd)"
# shellcheck source=../../../verificar/scripts/test/sh-helpers.sh
source "$ROOT/.claude/skills/verificar/scripts/test/sh-helpers.sh"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
repo="$tmp/repo"
mkdir -p "$tmp/bin" "$repo/scripts" "$repo/.claude/skills" "$repo/apps/api/prisma"
cp -R "$ROOT/.claude/skills/contrato" "$repo/.claude/skills/"
rm -rf "$repo/.claude/skills/contrato/scripts/test"
cp "$ROOT/scripts/node-in-api.sh" "$repo/scripts/"

# O `docker` falso: `diff` (a comparação do contrato) sai com FAKE_DIFF, 0 se os snapshots são iguais e 1 se diferem; o
# `changelog` falha com FAKE_CHANGELOG_FAIL; o Node no contêiner devolve o Markdown de mentira; `exec api true` está no ar.
cat >"$tmp/bin/docker" <<'FAKE'
#!/usr/bin/env bash
args="$*"
case "$args" in
  *" diff "*) exit "${FAKE_DIFF:-0}" ;;
  *" changelog "*)
    [[ -n "${FAKE_CHANGELOG_FAIL:-}" ]] && { echo "erro do oasdiff" >&2; exit 1; }
    echo "CHANGELOG DO OASDIFF"
    ;;
  *" exec -T -w /repo api node "*)
    cat >/dev/null
    printf '# Contrato\n\nRENDERIZADO\n\n# Schema\n\nDIFF DO SCHEMA\n'
    ;;
esac
exit 0
FAKE
chmod +x "$tmp/bin/docker"
export PATH="$tmp/bin:$PATH"

git -C "$repo" init -q -b main
git -C "$repo" config user.email t@t
git -C "$repo" config user.name t
printf '{"openapi":"3.0.0","info":{"title":"a","version":"1"},"paths":{}}\n' >"$repo/apps/api/openapi.json"
printf 'model A {}\n' >"$repo/apps/api/prisma/schema.prisma"
git -C "$repo" add -A && git -C "$repo" commit -q -m plano
plan="$(git -C "$repo" rev-parse HEAD)"
short="$(git -C "$repo" rev-parse --short HEAD)"
drift="$repo/docs/tickets/PROJ-1/PROJ-2/contract-drift.txt"

# drift <alvo, ou vazio>: roda o comando contra a pasta de trabalho; deixa a saída em $out e o código em $code.
drift() {
  rm -f "$drift"
  out="$(cd "$repo" && .claude/skills/contrato/scripts/contract-drift.sh "$plan" "$1" "$drift" 2>&1)"
  code=$?
}

name="o desvio desde o commit de plano imprime a visão do snapshot e do schema, diz quando não há desvio e só avisa @LUI-197-CA2"

# Sem diferença: diz que está igual, não grava o arquivo, sai com 0.
FAKE_DIFF=0 drift ""
check "$name: sem diferença, diz que o contrato e o schema estão iguais ao planejado e sai com 0" \
  bash -c '[[ $1 -eq 0 && $2 == "O contrato e o schema estão iguais ao planejado no commit de plano $3."* ]]' _ "$code" "$out" "$short"
check "$name: sem diferença, não grava o arquivo do desvio" test ! -e "$drift"

# O snapshot diferente: a visão vai para a saída e para o arquivo, com o aviso, e sai com 0.
FAKE_DIFF=1 drift ""
check "$name: com o snapshot diferente, imprime a visão e o aviso do desvio, e sai com 0" \
  bash -c '[[ $1 -eq 0 && $2 == *"RENDERIZADO"* && $2 == *"::warning title=Contrato diferente do planejado::"* && $2 == *"depois do commit de plano $3"* ]]' _ "$code" "$out" "$short"
check "$name: com o snapshot diferente, acrescenta a visão ao arquivo do desvio" grep -q 'RENDERIZADO' "$drift"

# Só o schema diferente: a comparação do contrato é igual, mas o desvio existe.
printf 'model A {}\nmodel B {}\n' >"$repo/apps/api/prisma/schema.prisma"
FAKE_DIFF=0 drift ""
check "$name: com só o schema diferente, avisa o desvio e sai com 0" \
  bash -c '[[ $1 -eq 0 && $2 == *"DIFF DO SCHEMA"* && $2 == *"::warning title=Contrato diferente do planejado::"* ]]' _ "$code" "$out"
git -C "$repo" checkout -q -- apps/api/prisma/schema.prisma

# A visão que não pode ser montada: o erro dela no lugar do desvio, o aviso e a saída 0.
printf '{"openapi":"3.0.0","info":{"title":"a","version":"1"},"paths":{"/y":{}}}\n' >"$repo/apps/api/openapi.json"
FAKE_DIFF=1 FAKE_CHANGELOG_FAIL=1 drift ""
check "$name: quando a visão não pode ser montada, diz isso no lugar do desvio, avisa e sai com 0" \
  bash -c '[[ $1 -eq 0 && $2 == *"não pôde ser montada"* && $2 == *"::warning title=Contrato diferente do planejado::"* ]]' _ "$code" "$out"
check "$name: quando a visão não pode ser montada, grava o erro no arquivo do desvio" grep -q 'não pôde ser montada' "$drift"

git -C "$repo" checkout -q -- apps/api/openapi.json

# O alvo é um commit: o desvio é entre o commit de plano e ele, e não a pasta de trabalho.
printf '{"openapi":"3.0.0","info":{"title":"a","version":"1"},"paths":{"/x":{}}}\n' >"$repo/apps/api/openapi.json"
git -C "$repo" commit -q -am muda
FAKE_DIFF=1 drift "$(git -C "$repo" rev-parse HEAD)"
check "$name: com um commit como alvo, compara o commit de plano com ele" \
  bash -c '[[ $1 -eq 0 && $2 == *"RENDERIZADO"* ]]' _ "$code" "$out"

finish "do comando do desvio do contrato"
