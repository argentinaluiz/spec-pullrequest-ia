#!/usr/bin/env bash
#
# Teste do Node no contêiner (scripts/node-in-api.sh), que é o comando do Node deste projeto: o `docker` é trocado
# por um falso, que registra os argumentos e a entrada padrão que recebe e responde o que o caso combinou, então nenhum
# contêiner entra no caso. Roda na máquina. O caso leva a tag do critério de aceite no nome.

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
# shellcheck source=../../.claude/skills/verificar/scripts/test/sh-helpers.sh
source "$ROOT/.claude/skills/verificar/scripts/test/sh-helpers.sh"

NODE="$ROOT/scripts/node-in-api.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"

# O `docker` falso: o `exec ... node` registra os argumentos e a entrada e sai com FAKE_NODE_CODE; o `exec api true`
# (o contêiner está no ar?) sai com FAKE_UP; o `exec api test -d /repo` (a montagem existe?), com FAKE_MOUNT.
cat >"$tmp/bin/docker" <<'FAKE'
#!/usr/bin/env bash
args="$*"
case "$args" in
  *" exec -T -w /repo api node "*)
    printf '%s\n' "$args" >"$FAKE_DIR/args"
    cat >"$FAKE_DIR/stdin"
    exit "${FAKE_NODE_CODE:-0}"
    ;;
  *" exec -T api true") exit "${FAKE_UP:-0}" ;;
  *" exec -T api test -d /repo") exit "${FAKE_MOUNT:-0}" ;;
esac
exit 0
FAKE
chmod +x "$tmp/bin/docker"
export FAKE_DIR="$tmp" PATH="$tmp/bin:$PATH"

# run_node <entrada> <argumentos...>: roda o comando com a entrada dada; deixa o código em $code e as saídas em $out.
run_node() {
  local input="$1"
  shift
  : >"$tmp/args"
  : >"$tmp/stdin"
  out="$(printf '%s' "$input" | "$NODE" "$@" 2>&1)"
  code=$?
}

name="o Node roda no contêiner pelo caminho novo, repassa a entrada e diz como subir o ambiente @LUI-197-CA1"

run_node 'entrada do Node' scripts/x.cjs - docs/tickets
check "$name: chama o node no contêiner api, na raiz /repo, com os argumentos como estão" \
  grep -qF -- "compose -f $ROOT/scripts/../compose.dev.yaml exec -T -w /repo api node scripts/x.cjs - docs/tickets" "$tmp/args"
check "$name: repassa a entrada padrão ao Node" test "$(cat "$tmp/stdin")" = 'entrada do Node'
check "$name: sai com 0 quando o Node sai com 0" test "$code" -eq 0

FAKE_NODE_CODE=1 run_node '' x.cjs
check "$name: sai com o código do Node quando ele falha e o contêiner está no ar" test "$code" -eq 1

run_node ''
check "$name: sem argumentos, sai com 2 e mostra o uso" bash -c '[[ $1 -eq 2 && $2 == *"Uso:"* ]]' _ "$code" "$out"

FAKE_NODE_CODE=1 FAKE_UP=1 run_node '' x.cjs
check "$name: com o contêiner fora do ar, sai com 2 e diz como subir o ambiente" \
  bash -c '[[ $1 -eq 2 && $2 == *"não está no ar"* && $2 == *"docker compose -f compose.dev.yaml up -d --build --wait"* ]]' _ "$code" "$out"

FAKE_NODE_CODE=1 FAKE_MOUNT=1 run_node '' x.cjs
check "$name: com o contêiner sem o repositório montado, sai com 2 e diz como recriar o serviço" \
  bash -c '[[ $1 -eq 2 && $2 == *"sem o repositório montado em /repo"* && $2 == *"up -d --wait api"* ]]' _ "$code" "$out"

finish "do Node no contêiner"
