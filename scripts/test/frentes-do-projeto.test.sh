#!/usr/bin/env bash
#
# Teste das frentes deste projeto: o núcleo da skill worktree, com o arquivo de configuração do projeto (.config/worktree)
# e o comando de ambiente da frente daqui (scripts/frente-ambiente.sh). O arquivo de configuração e o comando de ambiente
# são copiados, nos caminhos de sempre, para um repositório temporário, e o núcleo de verdade roda nele sem a pessoa
# digitar opção nenhuma. Rodam na máquina. Os casos levam a tag do critério de aceite no nome.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=../../.claude/skills/verificar/scripts/test/sh-helpers.sh
source "$ROOT/.claude/skills/verificar/scripts/test/sh-helpers.sh"

CORE="$ROOT/.claude/skills/worktree/scripts/frentes.sh"
CONFIG="$ROOT/.config/worktree"
ENV_COMMAND=scripts/frente-ambiente.sh
work="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$work"' EXIT
name="o arquivo de configuração do projeto dá ao núcleo os valores deste projeto, sem a pessoa digitar opção @LUI-199-CA6"

# Os valores do arquivo de configuração: o limite 3, o comando de ambiente que existe e é executável, e só os cinco tipos
# de ponto de convergência que o modo sincronizar conhece.
config_values() {
  [[ "$(git config --file "$CONFIG" --get frentes.limite)" == 3 ]] || return 1
  [[ "$(git config --file "$CONFIG" --get frentes.ambiente)" == "$ENV_COMMAND" && -x "$ROOT/$ENV_COMMAND" ]] || return 1
  git config --file "$CONFIG" --get-regexp '^convergencia\.' | grep -q . || return 1
  ! git config --file "$CONFIG" --get-regexp '^convergencia\.' | grep -vE '^convergencia\.(gerado|migracoes|registros|documentos|manual) '
}
check "$name: o limite, o comando de ambiente que existe e os tipos dos pontos de convergência" config_values

# project_repo <nome>: um checkout principal de um repositório temporário, com o arquivo de configuração e o comando de
# ambiente nos caminhos do projeto. Deixa o caminho em $repo.
project_repo() {
  git init -q --bare -b main "$work/$1-remoto.git"
  git clone -q "$work/$1-remoto.git" "$work/$1" 2>/dev/null
  git -C "$work/$1" checkout -q -b main
  echo x >"$work/$1/a"
  git -C "$work/$1" add -A
  git -C "$work/$1" -c user.name=t -c user.email=t@t commit -q -m inicial
  git -C "$work/$1" "push" -q origin main
  mkdir -p "$work/$1/.config" "$work/$1/$(dirname "$ENV_COMMAND")"
  cp "$CONFIG" "$work/$1/.config/worktree"
  cp "$ROOT/$ENV_COMMAND" "$work/$1/$ENV_COMMAND"
  repo="$work/$1"
}

# O núcleo de verdade lê o arquivo do projeto: o listar roda num repositório de fora e mostra a tabela, com as portas do
# slot 0 que o comando de ambiente informa para o principal quando ele não está na main.
real_run() {
  local out
  project_repo listar
  git -C "$repo" checkout -q -b feature/lui-9
  out="$(cd "$repo" && HARNESS_BASE_REF=origin/main HARNESS_TEST=1 FRENTES_GH=/bin/false "$CORE" listar 2>&1)"
  [[ "$out" == *PASTA* && "$out" == *feature/lui-9* && "$out" == *3000/3001/4443/8025* ]]
}
check "$name: o núcleo de verdade lista as portas do slot que o comando de ambiente informa" real_run

# O `novo` de verdade, com o comando de ambiente de verdade e só o docker, o gh e a sonda de portas trocados pelo modo de
# teste: a porta ocupada do slot 1 recusa o `novo` sem criar pasta, branch nem `.env`, e com a porta livre ele cria a frente
# com o `.env` do slot e sobe o Compose na pasta nova.
real_new() {
  local front out
  project_repo novo
  front="$repo-lui-1"
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
    "$CORE" novo LUI-1 2>&1)"
  [[ $? -ne 0 && "$out" == *3010* && "$out" == *"node (PID 4242)"* ]] || return 1
  [[ ! -e "$front" ]] && ! git -C "$repo" rev-parse --verify -q feature/lui-1 >/dev/null && [[ ! -s "$DOCKER_LOG" ]] || return 1
  out="$(cd "$repo" && BUSY_PORT=0 HARNESS_BASE_REF=origin/main HARNESS_TEST=1 FRENTES_GH=/bin/false FRENTES_DOCKER="$work/docker" FRENTES_PORT_OWNER="$work/port-owner" \
    "$CORE" novo LUI-1 2>&1)"
  [[ $? -eq 0 ]] && grep -qxF 'SLOT=1' "$front/.env" && grep -qxF 'WEB_PORT=3010' "$front/.env" &&
    grep -qxF -- "$front|compose -f compose.dev.yaml up -d --build --wait" "$DOCKER_LOG"
}
check "$name: o novo recusa a porta ocupada sem criar nada, e com a porta livre grava o .env e sobe o Compose @LUI-186-CA1 @LUI-186-CA4" real_new

# A trava dos slots do núcleo e o semáforo da verificação completa ficam na mesma pasta da máquina: o núcleo define o caminho
# por conta própria (uma skill genérica não carrega arquivo do projeto), e este caso prende os dois à mesma expressão.
same_lock_folder() {
  local core verification
  core="$(sed -n '/^lock_dir()/,/^}/p' "$CORE" | grep -o 'rev-parse --path-format=absolute --git-common-dir)/harness')"
  verification="$(sed -n '/^full_semaphore_dir()/,/^}/p' "$ROOT/.claude/skills/verificar/scripts/full-semaphore.sh" | grep -o 'rev-parse --path-format=absolute --git-common-dir)/harness')"
  [[ -n "$core" && "$core" == "$verification" ]]
}
check "o núcleo das frentes e a verificação completa travam na mesma pasta das travas da máquina" same_lock_folder

finish "das frentes do projeto"
