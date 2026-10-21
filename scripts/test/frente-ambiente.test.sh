#!/usr/bin/env bash
#
# Testes do ambiente da frente deste projeto (scripts/frente-ambiente.sh), o comando de ambiente que o núcleo das frentes
# chama: o `criar` grava o `.env` do slot e sobe o Compose na pasta, o `verificar` confere as portas do slot, o
# `derrubar` derruba o Compose com os volumes e o `portas` imprime as portas do slot. Só o `docker` e a sonda de portas
# são trocados, pelo modo de teste do harness (HARNESS_TEST=1): programas deste teste, que registram o que receberam ou
# respondem o que o caso combinou. O contrato do `.env` é o do docs/lld.md, seção 6, "Ambiente local por slot". Rodam na
# máquina. Quem chama é o .claude/skills/verificar/scripts/verify.sh.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=../.claude/skills/verificar/scripts/test/sh-helpers.sh
source "$ROOT/.claude/skills/verificar/scripts/test/sh-helpers.sh"

AMBIENTE="$ROOT/scripts/frente-ambiente.sh"
work="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$work"' EXIT

# --- Os substitutos do modo de teste ---
export DOCKER_LOG="$work/docker.log" BUSY_PORTS="$work/busy-ports" DOCKER_FAIL="$work/docker-falha"
: >"$DOCKER_LOG"
: >"$BUSY_PORTS"
# O `docker`: registra a pasta e os argumentos, e falha enquanto existir o arquivo DOCKER_FAIL.
cat >"$work/docker" <<'STUB'
#!/usr/bin/env bash
echo "$PWD|$*" >>"$DOCKER_LOG"
[[ ! -e "$DOCKER_FAIL" ]]
STUB
# A sonda de portas: diz quem ocupa a porta dada, pelas linhas "<porta> <processo>" de $BUSY_PORTS.
cat >"$work/port-owner" <<'STUB'
#!/usr/bin/env bash
sed -n "s/^$1 //p" "$BUSY_PORTS"
STUB
chmod +x "$work/docker" "$work/port-owner"
export HARNESS_TEST=1 FRENTES_DOCKER="$work/docker" FRENTES_PORT_OWNER="$work/port-owner"

# ambiente <argumentos...>: roda o comando, com a saída em $out e o código em $code.
ambiente() {
  out="$(cd "$work" && "$AMBIENTE" "$@" 2>&1)"
  code=$?
}

contains() {
  [[ "$out" == *"$1"* ]]
}

# env_has <pasta> <linha>: o `.env` da pasta traz a linha.
env_has() {
  grep -qxF -- "$2" "$1/.env" 2>/dev/null
}

# --- O criar grava o .env do slot, com as portas e a máscara do .git, e sobe o Compose na pasta ---
create() {
  local line folder="$work/frente-1" second="$work/frente-2"
  mkdir -p "$folder" "$second"
  : >"$DOCKER_LOG"
  ambiente criar "$folder" 1
  [[ $code -eq 0 ]] || return 1
  # O `.env` do slot 1, pelo contrato da LLD.
  for line in SLOT=1 WEB_PORT=3010 API_PORT=3011 STORAGE_PORT=4453 MAILPIT_PORT=8035 \
    WEB_ORIGIN=http://localhost:3010 STORAGE_PUBLIC_URL=http://localhost:4453 \
    STORAGE_EMULATOR_HOST=http://storage:4453 GIT_MASK_TYPE=bind GIT_MASK_SOURCE=/dev/null; do
    env_has "$folder" "$line" || return 1
  done
  # O ambiente sobe na pasta, esperando ficar pronto.
  grep -qxF -- "$folder|compose -f compose.dev.yaml up -d --build --wait" "$DOCKER_LOG" || return 1
  # O slot 2 move as portas de novo.
  ambiente criar "$second" 2
  [[ $code -eq 0 ]] && env_has "$second" SLOT=2 && env_has "$second" WEB_PORT=3020 && env_has "$second" MAILPIT_PORT=8045 || return 1
  # Se o Compose não sobe, o comando diz como subir de novo e sai com erro; a pasta fica, com o slot.
  touch "$DOCKER_FAIL"
  ambiente criar "$folder" 1
  rm "$DOCKER_FAIL"
  [[ $code -ne 0 ]] && contains "não subiu" && contains "docker compose -f compose.dev.yaml up -d --build --wait" && env_has "$folder" SLOT=1
}
check "o ambiente da frente grava o .env do slot, confere as portas, sobe e derruba o Compose: o criar grava o .env e sobe @LUI-199-CA2 @LUI-186-CA1" create

# --- O verificar recusa o slot com porta ocupada, dizendo o processo ---
verify_ports() {
  : >"$BUSY_PORTS"
  ambiente verificar 1
  [[ $code -eq 0 ]] || return 1
  # A web do slot 1 está ocupada por outro processo.
  echo "3010 node (PID 4242)" >"$BUSY_PORTS"
  ambiente verificar 1
  [[ $code -ne 0 ]] && contains "3010" && contains "node (PID 4242)" || return 1
  # A porta de outro slot ocupada não atrapalha o slot 1.
  echo "3020 node (PID 4243)" >"$BUSY_PORTS"
  ambiente verificar 1
  [[ $code -eq 0 ]] || return 1
  : >"$BUSY_PORTS"
  # Um slot fora de 0 a 3 é uso errado.
  ambiente verificar 4
  [[ $code -eq 2 ]] && contains "de 0 a 3"
}
check "o ambiente da frente grava o .env do slot, confere as portas, sobe e derruba o Compose: o verificar recusa a porta ocupada, dizendo o processo @LUI-199-CA2 @LUI-186-CA4" verify_ports

# --- A sonda real de portas (o `ss`), sem a troca do modo de teste: um `ss` de mentira no PATH ---
real_probe() {
  mkdir -p "$work/probe/bin"
  cat >"$work/probe/bin/ss" <<'STUB'
#!/usr/bin/env bash
# O formato do ss -ltnpH: a porta 3010 tem dono.
[[ "$*" == *":3010 "* ]] && echo 'LISTEN 0 4096 0.0.0.0:3010 0.0.0.0:* users:(("node",pid=4242,fd=19))'
exit 0
STUB
  chmod +x "$work/probe/bin/ss"
  out="$(cd "$work" && env -u FRENTES_PORT_OWNER PATH="$work/probe/bin:$PATH" "$AMBIENTE" verificar 1 2>&1)"
  [[ $? -ne 0 ]] && contains "3010" && contains "node (PID 4242)" || return 1
  # Sem o `ss` na máquina, o comando recusa em vez de aprovar no escuro: um PATH só com o que ele usa.
  rm "$work/probe/bin/ss"
  local tool
  for tool in sed head tr bash env; do
    ln -sf "$(command -v "$tool")" "$work/probe/bin/$tool"
  done
  out="$(cd "$work" && env -u FRENTES_PORT_OWNER PATH="$work/probe/bin" "$AMBIENTE" verificar 1 2>&1)"
  [[ $? -ne 0 ]] && contains "Falta o \`ss\`"
}
check "a sonda real de portas lê o ss, e sem o ss o ambiente da frente recusa @LUI-199-CA2 @LUI-186-CA4" real_probe

# --- O derrubar derruba o Compose da pasta com os volumes ---
tear_down() {
  mkdir -p "$work/frente-3"
  : >"$DOCKER_LOG"
  ambiente derrubar "$work/frente-3"
  [[ $code -eq 0 ]] && grep -qxF -- "$work/frente-3|compose -f compose.dev.yaml down -v" "$DOCKER_LOG" || return 1
  touch "$DOCKER_FAIL"
  ambiente derrubar "$work/frente-3"
  rm "$DOCKER_FAIL"
  [[ $code -ne 0 ]] && contains "Não deu para derrubar"
}
check "o ambiente da frente grava o .env do slot, confere as portas, sobe e derruba o Compose: o derrubar derruba o Compose com os volumes @LUI-199-CA2" tear_down

# --- O portas imprime as quatro portas do slot ---
ports() {
  ambiente portas 0
  [[ "$out" == 3000/3001/4443/8025 ]] || return 1
  ambiente portas 1
  [[ "$out" == 3010/3011/4453/8035 ]] || return 1
  ambiente portas 3
  [[ "$out" == 3030/3031/4473/8055 ]] || return 1
  ambiente portas 7
  [[ $code -eq 2 ]]
}
check "o ambiente da frente grava o .env do slot, confere as portas, sobe e derruba o Compose: o portas imprime as quatro portas do slot @LUI-199-CA2" ports

finish "do ambiente da frente"
