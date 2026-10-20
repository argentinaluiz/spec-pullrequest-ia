#!/usr/bin/env bash
#
# Frentes paralelas: cada ticket pode correr num checkout próprio, com a própria sessão do agente, o
# próprio ambiente e o próprio PR.
#
#   scripts/frentes.sh novo <ticket> [tipo]        cria a frente do ticket (PREFIXO-N) e sobe o ambiente dela
#   scripts/frentes.sh listar                      as frentes abertas, com slot, branch, portas, PR e conflitos
#   scripts/frentes.sh remover <ticket> [--forcar] desmonta a frente do ticket
#
# Uma frente é um worktree numa pasta irmã do checkout principal, chamada <principal>-<ticket em minúsculas>
# (o nome do projeto no Compose sai dela), na branch <tipo>/<ticket em minúsculas>, com o tipo feature
# (o padrão), bugfix, hotfix ou docs. O checkout principal também é uma frente quando está numa branch
# que não é a main (um HEAD solto conta). Uma frente do ticket é qualquer worktree cuja branch termina no
# ticket, com ou sem sufixo (feature/lui-186-script-de-frentes). A base é a HARNESS_BASE_REF, lida
# pelo scripts/harness-base.sh, o mesmo do .claude/skills/verificar/scripts/verify.sh: o remoto é o que vem antes da barra, e a main, o que
# vem depois. O script roda em qualquer checkout do repositório e não fala com o Linear.
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
# merge: é só do usuário, e o hook de antes do comando (.claude/skills/verificar/hooks/push-verify.sh) o nega ao agente.
#
# O `listar` mostra também com quem cada frente conflita, na última coluna ("conflita com") e numa seção
# "CONFLITOS" abaixo da tabela, que traz os arquivos de cada par de frentes e de cada frente contra a main do
# remoto da base. É um merge de três vias só de leitura (`git merge-tree`) entre as pontas das branches: conta o
# que está em commit, como o merge de verdade, e não muda pasta, índice nem ref de nenhuma frente. Antes de
# calcular, busca a main do remoto (sem falhar se a rede faltar). Os arquivos em conflito saem em dois grupos:
# os pontos de convergência com regra mecânica, cada um com o tipo, e os que pedem atenção, que são o código
# e os pontos que se juntam à mão (documentos e manual), estes com o tipo ao lado do nome.
# A classificação, os tipos e os arquivos de cada um, é de .claude/skills/ambiente/pontos-de-convergencia.txt, o dono
# único dela: este script e a skill /sincronizar a leem, e um ponto novo é uma linha lá.
#
# Todo comando começa conferindo o Git: a versão mínima é a 2.38, a do `git merge-tree --write-tree`, que a
# coluna de conflitos do `listar` vai usar. Os testes (scripts/test/frentes.test.sh) rodam com
# HARNESS_TEST=1, que deixa trocar o docker, o gh, a sonda de portas e a versão do Git (FRENTES_DOCKER,
# FRENTES_GH, FRENTES_PORT_OWNER e FRENTES_GIT_VERSION); sem ele essas variáveis são ignoradas.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# A base (BASE_REF, BASE_REMOTE e BASE_BRANCH) vem do scripts/harness-base.sh, o mesmo que o .claude/skills/verificar/scripts/verify.sh carrega.
# shellcheck source=harness-base.sh
source "$SCRIPT_DIR/harness-base.sh"
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

# shellcheck source=../.claude/skills/verificar/scripts/full-semaphore.sh
source "$SCRIPT_DIR/../.claude/skills/verificar/scripts/full-semaphore.sh"

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
# o checkout principal. O worktree cuja pasta foi apagada à mão (o Git o marca `prunable`) não conta: apagar
# a pasta libera a frente, e o `git worktree prune` limpa o registro dela.
worktrees() {
  git worktree list --porcelain | awk -v RS= -F'\n' '{
    dir = ""; branch = ""; prunable = 0
    for (i = 1; i <= NF; i++) {
      if ($i ~ /^worktree /) dir = substr($i, 10)
      if ($i ~ /^branch /) branch = substr($i, 19)
      if ($i ~ /^prunable/) prunable = 1
    }
    if (!prunable) print dir "\t" branch
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
    [[ "$dir" != "$main" || "$branch" != "$BASE_BRANCH" ]] && printf '%s\t%s\n' "$dir" "$branch"
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
  git remote get-url "$BASE_REMOTE" 2>/dev/null | sed -nE 's#^(https?://[^/]+/|git@[^:]+:|ssh://git@[^/]+/)(.+/[^/]+)$#\2#p' | sed 's/\.git$//'
}

# O PR de uma branch, "ESTADO número commit" (o commit é a ponta do PR), ou nada sem PR. Havendo vários, vale o
# aberto, depois o mergeado, depois o resto, e em cada estado o de número maior: a branch que ganhou um PR novo
# depois de um mergeado está em uso.
# pr_of <branch>
pr_of() {
  local repo json
  [[ -n "$1" ]] || return 0
  repo="$(remote_repo)"
  json="$("$GH" pr list ${repo:+--repo "$repo"} --head "$1" --state all --json number,state,headRefOid 2>/dev/null)" || json='[]'
  jq -r 'sort_by(-.number) | (map(select(.state == "OPEN")) + map(select(.state == "MERGED")) + .)[0] // empty
    | "\(.state) \(.number) \(.headRefOid // "")"' <<<"$json"
}

# O PR para a pessoa: "#5 aberto", "#5 mergeado", "#5 fechado" ou "sem PR".
# pr_label <branch>
pr_label() {
  local state number
  read -r state number _ <<<"$(pr_of "$1")"
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

# O marcador de um par cujo merge não deu para calcular, no lugar do arquivo.
COMPUTE_ERROR="@@erro"

# O tipo de um ponto de convergência (gerado, migracoes, registros, documentos ou manual), pela classificação de
# .claude/skills/ambiente/pontos-de-convergencia.txt; nada, se o arquivo é código.
# convergence_type <arquivo>
convergence_type() {
  local type pattern
  while IFS=$'\t' read -r type pattern; do
    [[ -z "$type" || "$type" == \#* ]] && continue
    # shellcheck disable=SC2053
    [[ "$1" == $pattern ]] && { echo "$type"; return 0; }
  done <"$SCRIPT_DIR/../.claude/skills/ambiente/pontos-de-convergencia.txt"
  return 0
}

# Os arquivos em que dois pontos do histórico conflitam, um por linha. Sai com 0 sem conflito, 1 com conflito
# e 2 quando não deu para calcular. É um merge de três vias só de leitura: o `git merge-tree` escreve objetos
# no banco do Git e não mexe em pasta, índice nem ref.
# conflict_files <a> <b>
conflict_files() {
  local out code
  out="$(git -c core.quotePath=false merge-tree --write-tree --name-only --no-messages "$1" "$2" 2>/dev/null)"
  code=$?
  # O 1 também é o código de uma referência que não se alcança. Num conflito de verdade, a primeira linha da
  # saída é o id da árvore; sem ela, ou com qualquer outro código além do 0 e do 1, é um erro do Git.
  if [[ $code -eq 1 && "$(head -n 1 <<<"$out")" =~ ^[0-9a-f]{40,64}$ ]]; then
    sed 1d <<<"$out"
    return 1
  fi
  [[ $code -eq 0 ]] || code=2
  return $code
}

# Os conflitos entre as pontas das frentes, uma linha por arquivo: "a<TAB>b<TAB>arquivo", com o b sendo a main
# do remoto da base, escrita como `main`. Só o que está em commit entra, como no merge de verdade.
# front_conflicts <branch...>
front_conflicts() {
  local i j a b file code
  for ((i = 1; i <= $#; i++)); do
    a="${!i}"
    for ((j = i + 1; j <= $# + 1; j++)); do
      if ((j > $#)); then b="$BASE_REF"; else b="${!j}"; fi
      [[ -n "$a" && -n "$b" ]] || continue
      while IFS= read -r file; do
        [[ -n "$file" ]] && printf '%s\t%s\t%s\n' "$a" "${b#"$BASE_REMOTE"/}" "$file"
      done < <(conflict_files "$a" "$b" || { [[ $? -eq 2 ]] && echo "$COMPUTE_ERROR"; true; })
    done
  done
}

cmd_listar() {
  local dir branch slot i dirs=() branches=() conflicts pair last="" a b file type mechanical attention failed
  # A main do remoto, sem perguntar nada e sem esperar mais de 20 s: sem rede, vale a do último fetch.
  GIT_TERMINAL_PROMPT=0 timeout 20 git fetch -q "$BASE_REMOTE" "$BASE_BRANCH" 2>/dev/null
  while IFS=$'\t' read -r dir branch; do
    dirs+=("$dir")
    branches+=("$branch")
  done < <(fronts)
  conflicts="$(front_conflicts "${branches[@]}")"

  printf '%-34s %-5s %-40s %-22s %-18s %s\n' PASTA SLOT BRANCH PORTAS PR "CONFLITA COM"
  for i in "${!dirs[@]}"; do
    slot="$(slot_of "${dirs[$i]}")"
    branch="${branches[$i]}"
    printf '%-34s %-5s %-40s %-22s %-18s %s\n' "$(basename "${dirs[$i]}")" "$slot" "${branch:-(HEAD solto)}" \
      "$(ports_of_slot "$slot")" "$(pr_label "$branch")" \
      "$(awk -F'\t' -v me="$branch" '
        $1 == me { print ($2 ~ /\// ? substr($2, index($2, "/") + 1) : $2) ($3 == "@@erro" ? "?" : "") }
        $2 == me { print substr($1, index($1, "/") + 1) ($3 == "@@erro" ? "?" : "") }' <<<"$conflicts" | sort -u | paste -sd ' ')"
  done

  [[ -n "$conflicts" ]] || return 0
  printf '\nCONFLITOS\n'
  while IFS=$'\t' read -r a b file; do
    pair="$a × $b"
    [[ "$pair" == "$last" ]] || { [[ -z "$last" ]] || flush_conflict "$last" "$mechanical" "$attention"; last="$pair"; mechanical=""; attention=""; }
    if [[ "$file" == "$COMPUTE_ERROR" ]]; then
      attention+="    não deu para calcular o merge deste par (a referência não existe, ou o Git falhou)"$'\n'
      continue
    fi
    type="$(convergence_type "$file")"
    case "$type" in
      gerado | migracoes | registros) mechanical+="    $type: $file"$'\n' ;;
      documentos | manual) attention+="    $file ($type)"$'\n' ;;
      *) attention+="    $file"$'\n' ;;
    esac
  done <<<"$conflicts"
  flush_conflict "$last" "$mechanical" "$attention"
}

# Escreve os conflitos de um par: os pontos de convergência com regra mecânica à parte, e os que pedem atenção.
# flush_conflict <par> <mecânicos> <atenção>
flush_conflict() {
  printf '%s\n' "$1"
  [[ -z "$2" ]] || printf '  ponto de convergência (regra mecânica):\n%s' "$2"
  [[ -z "$3" ]] || printf '  pede atenção:\n%s' "$3"
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
  git fetch -q "$BASE_REMOTE" "$BASE_BRANCH" || die "Não deu para buscar a main do remoto \`$BASE_REMOTE\`."
  lock_slots
  if [[ -n "$(ticket_worktrees "$TICKET_KEY")" ]]; then
    die "O ticket $1 já tem frente: $(ticket_worktrees "$TICKET_KEY" | cut -f 1 | paste -sd ' ')"
  fi
  if [[ "$(fronts | wc -l)" -ge "$FRENTES_LIMITE" ]]; then
    die "Já há $FRENTES_LIMITE frentes abertas, o limite de $FRENTES_LIMITE frentes ao todo (FRENTES_LIMITE), e o principal conta quando não está na $BASE_BRANCH." \
      "As abertas:" "$(cmd_listar)"
  fi
  slot="$(free_slot)" || die "Não há slot livre (1 a 3)."
  require_free_ports "$slot"
  git worktree add -q --no-track -b "$branch" "$folder" "$BASE_REF" || die "Não deu para criar a pasta $folder e a branch $branch."
  write_env "$folder" "$slot" || die "Não deu para gravar o .env em $folder. A pasta ficou, sem o slot; remova-a com o git worktree remove."
  unlock_slots
  (cd "$folder" && "$DOCKER" compose -f "$COMPOSE_FILE" up -d --build --wait) ||
    die "O ambiente da frente não subiu. A pasta $folder ficou, com o slot $slot; veja o erro acima, e suba de novo com:" \
      "  cd $folder && docker compose -f $COMPOSE_FILE up -d --build --wait"
  echo "Frente pronta: $folder (slot $slot, branch $branch)."
  echo "Abra a sessão nela com: cd $folder && claude"
}

cmd_remover() {
  local ticket="" arg force=() matches dir branch pr pr_tip tip dirty main
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
    read -r _ _ pr_tip <<<"$(pr_of "$branch")"
    tip="$(git rev-parse "refs/heads/$branch")"
    [[ -z "$pr_tip" || "$pr_tip" == "$tip" ]] ||
      die "A branch $branch tem commits que o PR mergeado não tem (a ponta do PR é ${pr_tip:0:7}, e a da branch, ${tip:0:7}). Mande o trabalho novo num PR, ou abandone-o com a opção do usuário."
    dirty="$(git -C "$dir" status --porcelain)"
    [[ -z "$dirty" ]] || die "A pasta $dir tem mudanças que não estão em commit:" "$dirty" "Faça o commit ou descarte, e rode de novo."
  fi

  (cd "$dir" && "$DOCKER" compose -f "$COMPOSE_FILE" down -v) || die "Não deu para derrubar o ambiente de $dir, e nada foi removido."
  # Sai da pasta antes de removê-la: chamado de dentro da frente, o `git branch -D` rodaria numa pasta que não existe mais.
  main="$(main_checkout)"
  cd "$main" || die "Não deu para entrar no checkout principal $main."
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
