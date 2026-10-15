#!/usr/bin/env bash
#
# Roda o Node no contêiner `api`, que o tem e só enxerga a pasta da própria app. É o comando do Node
# deste projeto para a skill de plano (o AGENTS.md da raiz o declara em "Plano do ticket") e o do
# `node_in_api` do scripts/verify.sh, que o usa para o conferidor, o renderizador e os testes do harness.
#
#   scripts/node-in-api.sh [--subpasta <subpasta>] [--dados <pasta>] <argumentos do node>...
#
# Os arquivos chegam ao contêiner pela entrada padrão, num tar, em reports/<subpasta>/ da API, que
# começa vazia, e o Node roda de lá, com a saída dele aqui. Sem --subpasta, a subpasta é única por
# chamada e sai no fim, para duas chamadas ao mesmo tempo não apagarem uma a outra; com ela, fica,
# para quem a lê depois (o relatório dos testes do harness).
#
# Vão sempre os scripts do harness (scripts/*.cjs e scripts/test/*.cjs) e os da skill de plano, com
# os mesmos caminhos relativos à raiz, para o conferidor importar o parser de lá. Vai também a pasta
# do script (o primeiro argumento que é um arquivo), pelo lugar real dele: dentro do repositório, com
# o caminho relativo à raiz; fora dele (uma skill instalada em outro lugar), em .script/, e o
# argumento passa a apontar para lá. Com --dados, vai o conteúdo da <pasta>, na raiz da subpasta, e
# os outros argumentos são relativos a ela. Sem ele, vai cada argumento que é um arquivo ou uma pasta
# de dentro do repositório, com o caminho relativo à raiz (um caminho que sai dele, por `..`, por um
# caminho absoluto ou por um link, não vai). O arquivo para onde a saída padrão é gravada nunca vai.
#
# Sai com o código do Node, ou com 2 quando o contêiner não está no ar.

set -uo pipefail

usage() {
  echo 'Uso: scripts/node-in-api.sh [--subpasta <subpasta>] [--dados <pasta>] <argumentos do node>...' >&2
  exit 2
}

# O caminho real (sem `..` nem links) de um arquivo ou de uma pasta que existe.
# real <caminho>
real() {
  if [[ -d "$1" ]]; then
    (cd "$1" && pwd -P)
  else
    printf '%s/%s' "$(cd "$(dirname "$1")" && pwd -P)" "$(basename "$1")"
  fi
}

root="$(cd "$(dirname "$0")/.." && pwd -P)" || exit 2

subdir='' data=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --subpasta)
      [[ $# -ge 2 && -n "$2" ]] || usage
      subdir="$2"
      shift 2
      ;;
    --dados)
      [[ $# -ge 2 && -d "$2" ]] || usage
      data="$(real "$2")"
      shift 2
      ;;
    *) break ;;
  esac
done
[[ $# -gt 0 ]] || usage

PLAN_SKILL_SCRIPTS=.claude/skills/plan-ticket/scripts
# As pastas que vão sempre, com os scripts do harness e os da skill.
ALWAYS=(scripts scripts/test "$PLAN_SKILL_SCRIPTS" "$PLAN_SKILL_SCRIPTS/test")

# O arquivo para onde a saída padrão é gravada, quando ela é um arquivo (pelo /proc, no Linux), fica
# de fora do tar.
output="$(readlink -f "/proc/$$/fd/1" 2>/dev/null)"
[[ -f "$output" ]] || output=''

# Os caminhos dos argumentos são resolvidos daqui, de onde o script foi chamado, antes de ir à raiz.
files=() args=() script='' outside=''
for arg in "$@"; do
  if [[ -z "$script" && "$arg" != -* && -f "$arg" ]]; then
    script="$(real "$arg")"
    if [[ "$script" == "$root"/* ]]; then
      folder="$(dirname "${script#"$root"/}")"
      [[ " ${ALWAYS[*]} " == *" $folder "* ]] && files+=("${script#"$root"/}") || files+=("$folder")
      args+=("${script#"$root"/}")
    else
      outside="$(dirname "$script")"
      args+=(".script/$(basename "$script")")
    fi
  elif [[ -z "$data" && "$arg" != -* && -e "$arg" ]]; then
    path="$(real "$arg")"
    if [[ "$path" == "$root"/* ]]; then
      [[ "$path" == "$output" ]] || files+=("${path#"$root"/}")
      args+=("${path#"$root"/}")
    else
      args+=("$arg")
    fi
  else
    args+=("$arg")
  fi
done
excludes=()
[[ "$output" == "$root"/* ]] && excludes+=("--exclude=${output#"$root"/}")

cd "$root" || exit 2
COMPOSE=(docker compose -f compose.dev.yaml)

clean=0
if [[ -z "$subdir" ]]; then
  subdir="node-in-api-$$-$RANDOM"
  clean=1
fi

# A pasta de fora do repositório entra no tar como .script/, copiada para uma pasta temporária.
stage=''
if [[ -n "$outside" ]]; then
  stage="$(mktemp -d)" || exit 2
  # shellcheck disable=SC2064 # o caminho é fixado agora, e não quando o trap roda.
  trap "rm -rf '$stage'" EXIT
  cp -R "$outside" "$stage/.script" || exit 2
fi

archive=(scripts/*.cjs scripts/test/*.cjs "$PLAN_SKILL_SCRIPTS"/*.cjs "$PLAN_SKILL_SCRIPTS"/test/*.cjs ${files[@]+"${files[@]}"})
[[ -n "$stage" ]] && archive+=(-C "$stage" .script)
[[ -n "$data" ]] && archive+=(-C "$data" .)

tar -c ${excludes[@]+"${excludes[@]}"} "${archive[@]}" |
  "${COMPOSE[@]}" exec -T api sh -c '
    base="$(pwd)" dir="reports/$1" clean="$2"
    shift 2
    rm -rf "$dir" && mkdir -p "$dir" && tar -x -C "$dir" && cd "$dir" || exit 1
    node "$@"
    code=$?
    [ "$clean" = 1 ] && rm -rf "$base/$dir"
    exit "$code"' \
    sh "$subdir" "$clean" "${args[@]}"
code=$?

# Só quando falha: se o contêiner não está no ar, diz como subi-lo.
if [[ $code -ne 0 ]] && ! "${COMPOSE[@]}" exec -T api true >/dev/null 2>&1; then
  printf '\nO contêiner `api` não está no ar, e o Node roda nele.\n' >&2
  printf 'Como corrigir: suba o ambiente com `%s up -d --build --wait` e rode de novo.\n' "${COMPOSE[*]}" >&2
  exit 2
fi
exit "$code"
