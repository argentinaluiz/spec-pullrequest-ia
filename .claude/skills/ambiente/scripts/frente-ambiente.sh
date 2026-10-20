#!/usr/bin/env bash
#
# O ambiente de uma frente deste projeto: o que o slot significa aqui (um bloco de portas na máquina, o `.env` que as
# grava e o Docker Compose da pasta da frente). É o comando de ambiente da frente que o núcleo das frentes (a skill
# worktree) chama, e o contrato dele é este: o núcleo numera a frente e guarda o número, e este comando o interpreta.
#
#   frente-ambiente.sh verificar <slot>          recusa o slot que não está livre na máquina, antes de criar qualquer coisa
#   frente-ambiente.sh criar <pasta> <slot>      grava o `.env` do slot na pasta e sobe o ambiente dela
#   frente-ambiente.sh derrubar <pasta>          derruba o ambiente da pasta, com os volumes
#   frente-ambiente.sh portas <slot>             imprime as portas do slot (web/API/storage/e-mails), para o `listar`
#
# O slot, de 0 a 3, dá à frente um bloco de portas: as de hoje mais slot x 10, para a web, a API, o storage e os e-mails
# (o slot 0 é o checkout principal). O `.env` que o `criar` grava é o contrato do docs/lld.md, seção 6, "Ambiente local por
# slot", com a máscara do `.git` por arquivo, porque a frente é um worktree. Depois dele, o `criar` sobe o ambiente com
# `docker compose up -d --build --wait` na pasta. O `verificar` confere, pelo `ss`, se alguma das quatro portas do slot está
# ocupada, e diz a porta e o processo (uma foto do momento).
#
# Os testes (test/frente-ambiente.test.sh) rodam com HARNESS_TEST=1, que deixa trocar o docker e a sonda de portas
# (FRENTES_DOCKER e FRENTES_PORT_OWNER); sem ele essas variáveis são ignoradas.
#
# Sai com 0 se deu certo e com 1 se não deu, dizendo por quê; com 2 no uso errado.

set -uo pipefail

COMPOSE_FILE=compose.dev.yaml
DOCKER=docker
PORT_OWNER=""
if [[ "${HARNESS_TEST:-}" == 1 ]]; then
  DOCKER="${FRENTES_DOCKER:-docker}"
  PORT_OWNER="${FRENTES_PORT_OWNER:-}"
fi

die() {
  printf '%s\n' "$@" >&2
  exit 1
}

usage() {
  echo 'Uso: frente-ambiente.sh verificar <slot> | criar <pasta> <slot> | derrubar <pasta> | portas <slot>' >&2
  exit 2
}

# O slot é um número de 0 a 3.
require_slot() {
  [[ "$1" =~ ^[0-3]$ ]] || { echo "O slot \`$1\` não vale: é um número de 0 a 3." >&2; exit 2; }
}

# As portas da máquina de um slot, na ordem web, API, storage e e-mails: as de hoje mais slot x 10.
ports_of_slot() {
  echo "$((3000 + $1 * 10))/$((3001 + $1 * 10))/$((4443 + $1 * 10))/$((8025 + $1 * 10))"
}

# O `.env` do slot, pelo contrato da LLD (seção 6, "Ambiente local por slot").
# write_env <pasta> <slot>
write_env() {
  local web api storage mailpit
  IFS=/ read -r web api storage mailpit <<<"$(ports_of_slot "$2")"
  cat >"$1/.env" <<ENV
SLOT=$2
WEB_PORT=$web
API_PORT=$api
STORAGE_PORT=$storage
MAILPIT_PORT=$mailpit
WEB_ORIGIN=http://localhost:$web
STORAGE_PUBLIC_URL=http://localhost:$storage
STORAGE_EMULATOR_HOST=http://storage:$storage
GIT_MASK_TYPE=bind
GIT_MASK_SOURCE=/dev/null
ENV
}

# Quem escuta numa porta da máquina: o processo e o PID, nada se está livre. Uma foto do momento.
# port_owner <porta>
port_owner() {
  if [[ -n "$PORT_OWNER" ]]; then
    "$PORT_OWNER" "$1"
    return
  fi
  ss -ltnpH "( sport = :$1 )" | head -n 1 | sed -nE 's/.*users:\(\("([^"]+)",pid=([0-9]+).*/\1 (PID \2)/p; t; s/.+/um processo que não se enxerga daqui/p'
}

# Recusa o slot se alguma das quatro portas dele já está ocupada, dizendo a porta e o processo. Sem o `ss`
# (do pacote iproute2), a conferência não existe, e o comando recusa em vez de aprovar no escuro.
# require_free_ports <slot>
require_free_ports() {
  local port owner busy=()
  [[ -n "$PORT_OWNER" ]] || command -v ss >/dev/null ||
    die "Falta o \`ss\` na máquina (o pacote iproute2), e o comando confere com ele se as portas do slot estão livres."
  for port in $(ports_of_slot "$1" | tr '/' ' '); do
    owner="$(port_owner "$port")"
    [[ -z "$owner" ]] || busy+=("a porta $port, ocupada por $owner")
  done
  [[ ${#busy[@]} -eq 0 ]] ||
    die "O slot $1 não está livre na máquina:" "${busy[@]/#/- }" "Pare o que ocupa as portas e rode de novo."
}

case "${1:-}" in
  verificar)
    [[ $# -eq 2 ]] || usage
    require_slot "$2"
    require_free_ports "$2"
    ;;
  criar)
    [[ $# -eq 3 ]] || usage
    require_slot "$3"
    write_env "$2" "$3" || die "Não deu para gravar o .env em $2. A pasta ficou, sem o slot; remova-a com o git worktree remove."
    (cd "$2" && "$DOCKER" compose -f "$COMPOSE_FILE" up -d --build --wait) ||
      die "O ambiente da frente não subiu. A pasta $2 ficou, com o slot $3; veja o erro acima, e suba de novo com:" \
        "  cd $2 && docker compose -f $COMPOSE_FILE up -d --build --wait"
    ;;
  derrubar)
    [[ $# -eq 2 ]] || usage
    (cd "$2" && "$DOCKER" compose -f "$COMPOSE_FILE" down -v) || die "Não deu para derrubar o ambiente de $2."
    ;;
  portas)
    [[ $# -eq 2 ]] || usage
    require_slot "$2"
    ports_of_slot "$2"
    ;;
  *) usage ;;
esac
