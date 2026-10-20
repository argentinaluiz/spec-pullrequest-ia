#!/usr/bin/env bash
#
# Teste do atalho das frentes deste projeto (scripts/frentes.sh): ele chama o núcleo da skill worktree com os valores
# daqui, sem a pessoa digitar opção nenhuma, e repassa o subcomando e os argumentos. O atalho é copiado, com a pasta da
# skill, para uma árvore de mentira em que o núcleo só imprime o que recebeu; o último caso roda o atalho de verdade, com o
# núcleo de verdade, num repositório temporário. Rodam na máquina. O caso leva a tag do critério de aceite no nome.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../../../.." && pwd)"
# shellcheck source=../../../verificar/scripts/test/sh-helpers.sh
source "$ROOT/.claude/skills/verificar/scripts/test/sh-helpers.sh"

SKILL="$ROOT/.claude/skills/ambiente"
work="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$work"' EXIT
name="o atalho chama o núcleo com os valores deste projeto e repassa o subcomando @LUI-199-CA6"

# A árvore de mentira: o atalho copiado ao lado de um núcleo que imprime um argumento por linha.
fake="$work/fake/.claude/skills"
mkdir -p "$fake/ambiente/scripts" "$fake/worktree/scripts"
cp "$SKILL/scripts/frentes.sh" "$fake/ambiente/scripts/frentes.sh"
cat >"$fake/worktree/scripts/frentes.sh" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$@"
STUB
chmod +x "$fake/worktree/scripts/frentes.sh"

shortcut_args() {
  "$fake/ambiente/scripts/frentes.sh" "$@" | paste -sd '|'
}

expected="--limite|3|--ambiente|$fake/ambiente/scripts/frente-ambiente.sh|--pontos|$fake/ambiente/pontos-de-convergencia.txt"
check "$name: o novo recebe o limite 3, o comando de ambiente e o arquivo dos pontos, e o ticket e o tipo" \
  test "$(shortcut_args novo LUI-1 bugfix)" = "$expected|novo|LUI-1|bugfix"
check "$name: o listar é repassado sem argumento a mais" test "$(shortcut_args listar)" = "$expected|listar"
check "$name: o remover repassa o ticket e a opção" test "$(shortcut_args remover LUI-1 --forcar)" = "$expected|remover|LUI-1|--forcar"

# Os arquivos que o atalho aponta existem no lugar de verdade: o comando de ambiente é executável e o arquivo dos pontos está lá.
check "$name: o comando de ambiente e o arquivo dos pontos que o atalho aponta existem" \
  bash -c 'test -x "$1/scripts/frente-ambiente.sh" && test -f "$1/pontos-de-convergencia.txt"' _ "$SKILL"

# O atalho de verdade chama o núcleo de verdade: o listar roda num repositório de fora e mostra a tabela, com as portas do
# slot 0 que o comando de ambiente informa para o principal quando ele não está na main.
real_run() {
  local out
  git init -q --bare -b main "$work/remoto.git"
  git clone -q "$work/remoto.git" "$work/principal" 2>/dev/null
  git -C "$work/principal" checkout -q -b main
  echo x >"$work/principal/a"
  git -C "$work/principal" add -A
  git -C "$work/principal" -c user.name=t -c user.email=t@t commit -q -m inicial
  git -C "$work/principal" "push" -q origin main
  git -C "$work/principal" checkout -q -b feature/lui-9
  out="$(cd "$work/principal" && HARNESS_TEST=1 FRENTES_GH=/bin/false "$SKILL/scripts/frentes.sh" listar 2>&1)"
  [[ "$out" == *PASTA* && "$out" == *feature/lui-9* && "$out" == *3000/3001/4443/8025* ]]
}
check "$name: o atalho de verdade chama o núcleo de verdade e o listar mostra as portas do slot" real_run

finish "do atalho das frentes"
