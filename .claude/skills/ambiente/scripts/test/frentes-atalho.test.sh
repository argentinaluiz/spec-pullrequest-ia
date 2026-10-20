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
  out="$(cd "$work/principal" && HARNESS_BASE_REF=origin/main HARNESS_TEST=1 FRENTES_GH=/bin/false "$SKILL/scripts/frentes.sh" listar 2>&1)"
  [[ "$out" == *PASTA* && "$out" == *feature/lui-9* && "$out" == *3000/3001/4443/8025* ]]
}
check "$name: o atalho de verdade chama o núcleo de verdade e o listar mostra as portas do slot" real_run

# A FRENTES_LIMITE ajusta o limite que o atalho passa ao núcleo.
check "$name: a FRENTES_LIMITE ajusta o limite que o atalho passa" \
  test "$(FRENTES_LIMITE=2 shortcut_args listar)" = "--limite|2|${expected#--limite|3|}|listar"

# O `novo` do atalho de verdade, com o comando de ambiente de verdade e só o docker, o gh e a sonda de portas trocados pelo
# modo de teste: a porta ocupada do slot 1 recusa o `novo` sem criar pasta, branch nem `.env`, e com a porta livre ele cria a
# frente com o `.env` do slot e sobe o Compose na pasta nova.
real_new() {
  local repo="$work/principal2" front="$work/principal2-lui-1" out
  git clone -q "$work/remoto.git" "$repo" 2>/dev/null
  cat >"$work/docker" <<'STUB'
#!/usr/bin/env bash
echo "$PWD|$*" >>"$DOCKER_LOG"
STUB
  cat >"$work/port-owner" <<'STUB'
#!/usr/bin/env bash
[[ "$1" == "$BUSY_PORT" ]] && echo "node (PID 4242)"
exit 0
STUB
  chmod +x "$work/docker" "$work/port-owner"
  export DOCKER_LOG="$work/docker.log"
  : >"$DOCKER_LOG"
  out="$(cd "$repo" && BUSY_PORT=3010 HARNESS_BASE_REF=origin/main HARNESS_TEST=1 FRENTES_GH=/bin/false FRENTES_DOCKER="$work/docker" FRENTES_PORT_OWNER="$work/port-owner" \
    "$SKILL/scripts/frentes.sh" novo LUI-1 2>&1)"
  [[ $? -ne 0 && "$out" == *3010* && "$out" == *"node (PID 4242)"* ]] || return 1
  [[ ! -e "$front" ]] && ! git -C "$repo" rev-parse --verify -q feature/lui-1 >/dev/null && [[ ! -s "$DOCKER_LOG" ]] || return 1
  out="$(cd "$repo" && BUSY_PORT=0 HARNESS_BASE_REF=origin/main HARNESS_TEST=1 FRENTES_GH=/bin/false FRENTES_DOCKER="$work/docker" FRENTES_PORT_OWNER="$work/port-owner" \
    "$SKILL/scripts/frentes.sh" novo LUI-1 2>&1)"
  [[ $? -eq 0 ]] && grep -qxF 'SLOT=1' "$front/.env" && grep -qxF 'WEB_PORT=3010' "$front/.env" &&
    grep -qxF -- "$front|compose -f compose.dev.yaml up -d --build --wait" "$DOCKER_LOG"
}
check "$name: o novo do atalho recusa a porta ocupada sem criar nada, e com a porta livre grava o .env e sobe o Compose @LUI-186-CA1 @LUI-186-CA4" real_new

# A trava dos slots do núcleo e o semáforo da verificação completa ficam na mesma pasta da máquina: o núcleo define o caminho
# por conta própria (uma skill genérica não carrega arquivo do projeto), e este caso prende os dois à mesma expressão.
same_lock_folder() {
  local core verification
  core="$(sed -n '/^lock_dir()/,/^}/p' "$ROOT/.claude/skills/worktree/scripts/frentes.sh" | grep -o 'rev-parse --path-format=absolute --git-common-dir)/harness')"
  verification="$(sed -n '/^full_semaphore_dir()/,/^}/p' "$ROOT/.claude/skills/verificar/scripts/full-semaphore.sh" | grep -o 'rev-parse --path-format=absolute --git-common-dir)/harness')"
  [[ -n "$core" && "$core" == "$verification" ]]
}
check "o núcleo das frentes e a verificação completa travam na mesma pasta das travas da máquina" same_lock_folder

finish "do atalho das frentes"
