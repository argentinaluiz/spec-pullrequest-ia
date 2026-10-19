#!/usr/bin/env bash
#
# Frentes paralelas: cada ticket pode correr num checkout próprio, com a própria sessão do agente, o
# próprio ambiente e o próprio PR.
#
#   scripts/frentes.sh novo <ticket> [tipo]        cria a frente do ticket (PREFIXO-N) e sobe o ambiente dela
#   scripts/frentes.sh listar                      as frentes abertas, com slot, branch, portas e PR
#   scripts/frentes.sh remover <ticket> [--forcar] desmonta a frente do ticket
#
# Uma frente é um worktree numa pasta irmã do checkout principal, chamada <principal>-<ticket em minúsculas>
# (o nome do projeto no Compose sai dela), na branch <tipo>/<ticket em minúsculas>, com o tipo feature
# (o padrão), bugfix, hotfix ou docs. O checkout principal também é uma frente quando está numa branch
# que não é a main (um HEAD solto conta). Uma frente do ticket é qualquer worktree cuja branch termina no
# ticket, com ou sem sufixo (feature/lui-186-script-de-frentes). A base é a HARNESS_BASE_REF do
# scripts/verify.sh, origin/main por padrão: o remoto é o que vem antes da barra, e a main, o que vem
# depois. O script roda em qualquer checkout do repositório e não fala com o Linear.
#
# O slot, de 0 a 3, dá à frente um bloco de portas na máquina. O principal é o slot 0, e o `novo` dá o
# menor livre de 1 a 3, pelo SLOT do `.env` de cada pasta de `git worktree list`: o slot mora na própria
# frente, e apagar a pasta o libera, sem registro central. O `.env` que o `novo` grava é o contrato do
# docs/lld.md, seção 6, "Ambiente local por slot", com a máscara do `.git` por arquivo, porque a frente é
# um worktree. Depois dele, o script sobe o ambiente com `docker compose up -d --build --wait` na pasta e
# imprime o comando para abrir a sessão nela. Duas criações ao mesmo tempo nunca pegam o mesmo slot: uma
# trava em frentes.lock, na pasta das travas da máquina (full_semaphore_dir), vale da conferência do
# limite até a gravação do `.env`.
#
# O `novo` recusa, sem criar nada: a frente além do limite (3 ao todo; FRENTES_LIMITE ajusta), mostrando a
# mesma lista do `listar`; um ticket que já tem frente; e o slot com alguma das quatro portas ocupada na
# máquina, dizendo a porta e o processo (uma foto do momento, pelo `ss`).
#
# O `remover` acha a frente pelo ticket e recusa o checkout principal e o ticket que casa com mais de uma
# branch. Sem o `--forcar`, recusa o PR que não está mergeado (o estado vem do `gh`, no repositório do
# remoto da base) e a pasta com mudança sem commit ou arquivo novo fora do .gitignore, dizendo o que
# encontrou. Então derruba o ambiente com os volumes (`docker compose down -v`), remove o worktree e apaga
# a branch local. O `--forcar` pula as duas conferências e remove com força, para abandonar um ticket sem
# merge: é só do usuário, e o hook de antes do comando (.claude/hooks/push-verify.sh) o nega ao agente.
#
# Todo comando começa conferindo o Git: a versão mínima é a 2.38, a do `git merge-tree --write-tree`, que a
# coluna de conflitos do `listar` vai usar. Os testes (scripts/test/frentes.test.sh) rodam com
# HARNESS_TEST=1, que deixa trocar o docker, o gh, a sonda de portas e a versão do Git (FRENTES_DOCKER,
# FRENTES_GH, FRENTES_PORT_OWNER e FRENTES_GIT_VERSION); sem ele essas variáveis são ignoradas.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_REF="${HARNESS_BASE_REF:-origin/main}"
REMOTE="${BASE_REF%%/*}"
MAIN_BRANCH="${BASE_REF#*/}"
COMPOSE_FILE=compose.dev.yaml
GIT_MIN=2.38
# O máximo de frentes ao todo, contando o principal quando ele é uma.
FRENTES_LIMITE="${FRENTES_LIMITE:-3}"

# Os substitutos do modo de teste do harness: só com HARNESS_TEST=1, e nada mais pode trocá-los.
DOCKER=docker
GH=gh
PORT_OWNER=""
GIT_VERSION_OVERRIDE=""
if [[ "${HARNESS_TEST:-}" == 1 ]]; then
  GIT_VERSION_OVERRIDE="${FRENTES_GIT_VERSION:-}"
  DOCKER="${FRENTES_DOCKER:-docker}"
  GH="${FRENTES_GH:-gh}"
  PORT_OWNER="${FRENTES_PORT_OWNER:-}"
fi

# shellcheck source=full-semaphore.sh
source "$SCRIPT_DIR/full-semaphore.sh"

die() {
  printf '%s\n' "$@" >&2
  exit 1
}

# Recusa um Git abaixo da versão mínima, antes de mexer em qualquer coisa.
require_git_version() {
  local found="${GIT_VERSION_OVERRIDE:-$(git version | sed -nE 's/^git version ([0-9]+(\.[0-9]+)*).*/\1/p')}"
  [[ "$(printf '%s\n%s\n' "$GIT_MIN" "$found" | sort -V | head -n 1)" == "$GIT_MIN" ]] ||
    die "O Git $found é mais antigo do que o script de frentes aceita: a versão mínima é a $GIT_MIN." \
      "Atualize o Git e rode de novo."
}

# O ticket PREFIXO-N em minúsculas (lui-186), no TICKET_KEY. Sai com o uso se o formato não vale.
# parse_ticket <ticket> <uso>
parse_ticket() {
  [[ "$1" =~ ^([A-Za-z][A-Za-z0-9]*)-([0-9]+)$ ]] || die "Uso: $2, com o ticket no formato PREFIXO-N (LUI-186)."
  TICKET_KEY="$(tr '[:upper:]' '[:lower:]' <<<"${BASH_REMATCH[1]}")-${BASH_REMATCH[2]}"
}

# Os worktrees do repositório, um por linha, "pasta<TAB>branch" (a branch vazia num HEAD solto). O primeiro é
# o checkout principal.
worktrees() {
  git worktree list --porcelain | awk -v RS= -F'\n' '{
    dir = ""; branch = ""
    for (i = 1; i <= NF; i++) {
      if ($i ~ /^worktree /) dir = substr($i, 10)
      if ($i ~ /^branch /) branch = substr($i, 19)
    }
    print dir "\t" branch
  }'
}

main_checkout() {
  worktrees | head -n 1 | cut -f 1
}

# O slot de uma pasta: o SLOT do `.env` dela, e 0 sem `.env` (são as portas de hoje).
slot_of() {
  local slot
  slot="$(sed -n 's/^SLOT=//p' "$1/.env" 2>/dev/null | head -n 1)"
  echo "${slot:-0}"
}

# O menor slot livre de 1 a 3, pelo `.env` de cada pasta da lista de worktrees. O principal fica no 0.
free_slot() {
  local dir used=" " slot
  while IFS=$'\t' read -r dir _; do
    used+="$(slot_of "$dir") "
  done < <(worktrees)
  for slot in 1 2 3; do
    [[ "$used" == *" $slot "* ]] || { echo "$slot"; return 0; }
  done
  return 1
}

# As frentes: os worktrees além do principal, e o principal quando a branch dele não é a main. Uma por
# linha, "pasta<TAB>branch".
fronts() {
  local main dir branch
  main="$(main_checkout)"
  while IFS=$'\t' read -r dir branch; do
    [[ "$dir" != "$main" || "$branch" != "$MAIN_BRANCH" ]] && printf '%s\t%s\n' "$dir" "$branch"
  done < <(worktrees)
}

# Os worktrees do ticket, "pasta<TAB>branch": a branch termina no ticket, com ou sem sufixo.
# ticket_worktrees <ticket em minúsculas>
ticket_worktrees() {
  local dir branch
  while IFS=$'\t' read -r dir branch; do
    [[ "${branch,,}" == */"$1" || "${branch,,}" == */"$1"-* ]] && printf '%s\t%s\n' "$dir" "$branch"
  done < <(worktrees)
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

# O repositório do remoto da base, no formato dono/nome, para o `gh` (o repositório tem dois remotos).
remote_repo() {
  git remote get-url "$REMOTE" 2>/dev/null | sed -nE 's#^(https?://[^/]+/|git@[^:]+:|ssh://git@[^/]+/)(.+/[^/]+)$#\2#p' | sed 's/\.git$//'
}

# O PR de uma branch, "ESTADO número" (MERGED, OPEN ou CLOSED, o mergeado primeiro), ou nada sem PR.
# pr_of <branch>
pr_of() {
  local repo json
  [[ -n "$1" ]] || return 0
  repo="$(remote_repo)"
  json="$("$GH" pr list ${repo:+--repo "$repo"} --head "$1" --state all --json number,state 2>/dev/null)" || json='[]'
  jq -r '(map(select(.state == "MERGED")) + map(select(.state == "OPEN")) + .)[0] // empty | "\(.state) \(.number)"' <<<"$json"
}

# O PR para a pessoa: "#5 aberto", "#5 mergeado", "#5 fechado" ou "sem PR".
# pr_label <branch>
pr_label() {
  local state number
  read -r state number <<<"$(pr_of "$1")"
  case "$state" in
    MERGED) echo "#$number mergeado" ;;
    OPEN) echo "#$number aberto" ;;
    CLOSED) echo "#$number fechado" ;;
    *) echo "sem PR" ;;
  esac
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
# (do pacote iproute2), a conferência não existe, e o script recusa em vez de aprovar no escuro.
# require_free_ports <slot>
require_free_ports() {
  local port owner busy=()
  [[ -n "$PORT_OWNER" ]] || command -v ss >/dev/null ||
    die "Falta o \`ss\` na máquina (o pacote iproute2), e o script confere com ele se as portas do slot estão livres."
  for port in $(ports_of_slot "$1" | tr '/' ' '); do
    owner="$(port_owner "$port")"
    [[ -z "$owner" ]] || busy+=("a porta $port, ocupada por $owner")
  done
  [[ ${#busy[@]} -eq 0 ]] ||
    die "O slot $1 não está livre na máquina:" "${busy[@]/#/- }" "Pare o que ocupa as portas e rode de novo."
}

cmd_listar() {
  local dir branch slot
  printf '%-34s %-5s %-40s %-22s %s\n' PASTA SLOT BRANCH PORTAS PR
  while IFS=$'\t' read -r dir branch; do
    slot="$(slot_of "$dir")"
    printf '%-34s %-5s %-40s %-22s %s\n' "$(basename "$dir")" "$slot" "${branch:-(HEAD solto)}" \
      "$(ports_of_slot "$slot")" "$(pr_label "$branch")"
  done < <(fronts)
}

# A trava dos slots: duas criações ao mesmo tempo nunca pegam o mesmo slot. Espera quem chegou depois, e sai
# com o processo.
lock_slots() {
  local dir
  dir="$(full_semaphore_dir)" && mkdir -p "$dir" || die "Não deu para abrir a pasta das travas da máquina."
  exec {SLOTS_LOCK_FD}>>"$dir/frentes.lock" && flock "$SLOTS_LOCK_FD" || die "Não deu para pegar a trava dos slots."
}

unlock_slots() {
  exec {SLOTS_LOCK_FD}>&-
}

cmd_novo() {
  local type="${2:-feature}" main folder branch slot
  parse_ticket "${1:-}" "scripts/frentes.sh novo <ticket> [tipo]"
  case "$type" in
    feature | bugfix | hotfix | docs) ;;
    *) die "O tipo \`$type\` não vale: a branch é feature, bugfix, hotfix ou docs (o padrão é feature)." ;;
  esac
  main="$(main_checkout)"
  folder="$(dirname "$main")/$(basename "$main")-$TICKET_KEY"
  branch="$type/$TICKET_KEY"

  # A rede antes da trava, para a espera de uma criação não esperar a rede da outra.
  git fetch -q "$REMOTE" "$MAIN_BRANCH" || die "Não deu para buscar a main do remoto \`$REMOTE\`."
  lock_slots
  if [[ -n "$(ticket_worktrees "$TICKET_KEY")" ]]; then
    die "O ticket $1 já tem frente: $(ticket_worktrees "$TICKET_KEY" | cut -f 1 | paste -sd ' ')"
  fi
  if [[ "$(fronts | wc -l)" -ge "$FRENTES_LIMITE" ]]; then
    die "Já há $FRENTES_LIMITE frentes abertas, o limite de $FRENTES_LIMITE frentes ao todo (FRENTES_LIMITE), e o principal conta quando não está na $MAIN_BRANCH." \
      "As abertas:" "$(cmd_listar)"
  fi
  slot="$(free_slot)" || die "Não há slot livre (1 a 3)."
  require_free_ports "$slot"
  git worktree add -q -b "$branch" "$folder" "$BASE_REF" || die "Não deu para criar a pasta $folder e a branch $branch."
  write_env "$folder" "$slot" || die "Não deu para gravar o .env em $folder. A pasta ficou, sem o slot; remova-a com o git worktree remove."
  unlock_slots
  (cd "$folder" && "$DOCKER" compose -f "$COMPOSE_FILE" up -d --build --wait) ||
    die "O ambiente da frente não subiu. A pasta $folder ficou, com o slot $slot; veja o erro acima, e suba de novo com:" \
      "  cd $folder && docker compose -f $COMPOSE_FILE up -d --build --wait"
  echo "Frente pronta: $folder (slot $slot, branch $branch)."
  echo "Abra a sessão nela com: cd $folder && claude"
}

cmd_remover() {
  local ticket="" arg force=() matches dir branch pr dirty
  for arg in "$@"; do
    case "$arg" in
      --forcar) force=(--force) ;;
      -*) die "A opção \`$arg\` não existe: o remover só aceita o --forcar." ;;
      *) [[ -z "$ticket" ]] || die "O remover recebe um ticket só, e vieram $ticket e $arg." ; ticket="$arg" ;;
    esac
  done
  parse_ticket "$ticket" "scripts/frentes.sh remover <ticket> [--forcar]"
  matches="$(ticket_worktrees "$TICKET_KEY")"
  [[ -n "$matches" ]] || die "Nenhuma frente do ticket $ticket: nenhuma branch é $TICKET_KEY, com ou sem sufixo."
  [[ "$(wc -l <<<"$matches")" -eq 1 ]] ||
    die "O ticket $ticket casa com mais de uma frente, e nada foi removido:" "$matches" "Remova pela pasta, com o git worktree remove."
  IFS=$'\t' read -r dir branch <<<"$matches"
  [[ "$dir" != "$(main_checkout)" ]] || die "A frente do $ticket é o checkout principal, $dir, e o principal nunca é removido."

  if [[ ${#force[@]} -eq 0 ]]; then
    pr="$(pr_label "$branch")"
    [[ "$pr" == *mergeado ]] || die "O PR da branch $branch não está mergeado ($pr). Só se remove uma frente com o PR mergeado."
    dirty="$(git -C "$dir" status --porcelain)"
    [[ -z "$dirty" ]] || die "A pasta $dir tem mudanças que não estão em commit:" "$dirty" "Faça o commit ou descarte, e rode de novo."
  fi

  (cd "$dir" && "$DOCKER" compose -f "$COMPOSE_FILE" down -v) || die "Não deu para derrubar o ambiente de $dir, e nada foi removido."
  git worktree remove "${force[@]}" "$dir" || die "Não deu para remover o worktree $dir."
  git branch -D "$branch" >/dev/null || die "O worktree saiu, mas não deu para apagar a branch $branch."
  echo "Frente do $ticket removida: $dir e a branch $branch."
}

require_git_version
case "${1:-}" in
  novo) shift; cmd_novo "$@" ;;
  listar) cmd_listar ;;
  remover) shift; cmd_remover "$@" ;;
  *) die "Uso: scripts/frentes.sh novo <ticket> [tipo] | listar | remover <ticket> [--forcar]" ;;
esac
