#!/usr/bin/env bash
#
# Frentes paralelas, o núcleo: cada ticket pode correr num checkout próprio (um worktree do Git), com a própria
# branch, a própria sessão do agente e o próprio PR. Este script só precisa do Git (e do `gh` para o estado do PR):
# o que é de um projeto, como um ambiente por frente, entra por opção, e o que não for dado é pulado.
#
#   frentes.sh [opções] novo <ticket> [tipo]         cria a frente do ticket (PREFIXO-N)
#   frentes.sh [opções] listar                        as frentes abertas, com slot, branch, portas, PR e conflitos
#   frentes.sh [opções] remover <ticket> [--forcar]   desmonta a frente do ticket
#
# As opções vêm antes do subcomando, e quem chama o núcleo (o atalho de um projeto) as passa:
#
#   --limite <n>          o máximo de frentes ao todo, contando o principal quando ele é uma (padrão 3)
#   --ambiente <comando>  o comando de ambiente da frente (padrão: nenhum, e o núcleo trabalha só com o Git). O núcleo
#                         o chama como `<comando> verificar <slot>` (recusa o slot que não está livre, antes de criar
#                         qualquer coisa), `<comando> criar <pasta> <slot>` (prepara e sobe o ambiente da pasta),
#                         `<comando> derrubar <pasta>` (derruba o ambiente) e `<comando> portas <slot>` (imprime as
#                         portas do slot, que o `listar` mostra). Sai com 0 se deu certo e com outro código, dizendo
#                         por quê, se não.
#   --pontos <arquivo>    a classificação dos pontos de convergência (padrão: nenhuma, e todo arquivo é código). O
#                         formato é o de um arquivo de linhas `tipo<TAB>padrão`, com `#` nos comentários.
#
# Uma frente é um worktree numa pasta irmã do checkout principal, chamada <principal>-<ticket em minúsculas>, na
# branch <tipo>/<ticket em minúsculas>, com o tipo feature (o padrão), bugfix, hotfix ou docs. O checkout principal
# também é uma frente quando está numa branch que não é a principal (um HEAD solto conta). Uma frente do ticket é
# qualquer worktree cuja branch termina no ticket, com ou sem sufixo (feature/lui-186-script-de-frentes). A base é a
# HARNESS_BASE_REF, lida pelo harness-base.sh desta skill: o remoto é o que vem antes da barra, e a branch principal, o
# que vem depois. O script roda em qualquer checkout do repositório e não fala com o gerenciador de issues.
#
# O slot, de 1 até o limite, é o número da frente (o principal é o 0). Ele mora na própria frente, num arquivo do
# diretório privado do Git do worktree (o que `git rev-parse --git-dir` imprime nele), e não em pasta do projeto: não
# há registro central, nada aparece na pasta da frente, e apagar a pasta libera o número, porque o Git passa a tratar o
# worktree como podável e ele deixa de contar. O `novo` dá o menor livre. Duas criações ao mesmo tempo nunca pegam o
# mesmo slot: uma trava em frentes.lock, na pasta das travas da máquina (a pasta `harness` do diretório comum do Git),
# vale da conferência do limite até a gravação do slot.
#
# O `novo` recusa, sem criar nada: a frente além do limite, mostrando a mesma lista do `listar`; um ticket que já tem
# frente; e, com o comando de ambiente, o slot que ele recusa. Com a frente criada e o slot gravado, chama o `criar` e
# imprime o comando para abrir a sessão nela.
#
# O `remover` acha a frente pelo ticket e recusa o checkout principal e o ticket que casa com mais de uma branch. Sem o
# `--forcar`, recusa o PR que não está mergeado (o estado vem do `gh`, no repositório do remoto da base) e a pasta com
# mudança sem commit ou arquivo novo fora do .gitignore, dizendo o que encontrou. Então chama o `derrubar` do comando
# de ambiente, remove o worktree e apaga a branch local. O `--forcar` pula as duas conferências e remove com força, para
# abandonar um ticket sem merge: é só do usuário, e o hook desta skill (hooks/frentes-guard.sh) o nega ao agente.
#
# O `listar` mostra também com quem cada frente conflita, na última coluna ("conflita com") e numa seção "CONFLITOS"
# abaixo da tabela, que traz os arquivos de cada par de frentes e de cada frente contra a base. É um merge de três vias
# só de leitura (`git merge-tree`) entre as pontas das branches: conta o que está em commit, como o merge de verdade, e
# não muda pasta, índice nem ref de nenhuma frente. Antes de calcular, busca a branch principal do remoto (sem falhar se
# a rede faltar). Os arquivos em conflito saem em dois grupos: os pontos de convergência com regra mecânica, cada um com
# o tipo, e os que pedem atenção, que são o código e os pontos que se juntam à mão (documentos e manual), estes com o
# tipo ao lado do nome. Sem o arquivo dos pontos, todo arquivo em conflito pede atenção.
#
# Todo comando começa conferindo o Git: a versão mínima é a 2.38, a do `git merge-tree --write-tree`. Os testes
# (test/frentes.test.sh) rodam com HARNESS_TEST=1, que deixa trocar o gh e a versão do Git (FRENTES_GH e
# FRENTES_GIT_VERSION); sem ele essas variáveis são ignoradas.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# A base (BASE_REF, BASE_REMOTE e BASE_BRANCH) vem do harness-base.sh, a definição única dela.
# shellcheck source=harness-base.sh
source "$SCRIPT_DIR/harness-base.sh"
GIT_MIN=2.38
# O arquivo do diretório privado do Git do worktree em que a frente guarda o slot.
SLOT_FILE=frente-slot

# Os valores que o chamador dá por opção, com os padrões.
LIMITE=3
AMBIENTE=""
PONTOS=""

# Os substitutos do modo de teste do harness: só com HARNESS_TEST=1, e nada mais pode trocá-los.
GH=gh
GIT_VERSION_OVERRIDE=""
if [[ "${HARNESS_TEST:-}" == 1 ]]; then
  GIT_VERSION_OVERRIDE="${FRENTES_GIT_VERSION:-}"
  GH="${FRENTES_GH:-gh}"
fi

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

# O slot de uma pasta: o do arquivo do diretório privado do Git dela, e 0 sem o arquivo (o checkout principal, e o
# worktree feito à mão).
slot_of() {
  local slot gitdir
  gitdir="$(git -C "$1" rev-parse --absolute-git-dir 2>/dev/null)" || { echo 0; return; }
  slot="$(head -n 1 "$gitdir/$SLOT_FILE" 2>/dev/null)"
  echo "${slot:-0}"
}

# Grava o slot na frente, no diretório privado do Git do worktree dela.
# store_slot <pasta> <slot>
store_slot() {
  local gitdir
  gitdir="$(git -C "$1" rev-parse --absolute-git-dir)" || return 1
  printf '%s\n' "$2" >"$gitdir/$SLOT_FILE"
}

# O menor slot livre de 1 até o limite, pelo arquivo de cada pasta da lista de worktrees. O principal fica no 0.
free_slot() {
  local dir used=" " slot
  while IFS=$'\t' read -r dir _; do
    used+="$(slot_of "$dir") "
  done < <(worktrees)
  for ((slot = 1; slot <= LIMITE; slot++)); do
    [[ "$used" == *" $slot "* ]] || { echo "$slot"; return 0; }
  done
  return 1
}

# As frentes: os worktrees além do principal, e o principal quando a branch dele não é a principal. Uma por
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

# As portas do slot, como o comando de ambiente as informa, ou "-" sem ele (ou se ele não sabe).
# ports_of_slot <slot>
ports_of_slot() {
  local ports=""
  [[ -z "$AMBIENTE" ]] || ports="$("$AMBIENTE" portas "$1" 2>/dev/null)"
  echo "${ports:--}"
}

# O repositório do remoto da base, no formato dono/nome, para o `gh` (o repositório pode ter mais de um remoto).
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

# O marcador de um par cujo merge não deu para calcular, no lugar do arquivo.
COMPUTE_ERROR="@@erro"

# O tipo de um ponto de convergência (gerado, migracoes, registros, documentos ou manual), pela classificação do
# arquivo dos pontos; nada, se o arquivo é código ou se não há arquivo dos pontos.
# convergence_type <arquivo>
convergence_type() {
  local type pattern
  [[ -n "$PONTOS" ]] || return 0
  while IFS=$'\t' read -r type pattern; do
    [[ -z "$type" || "$type" == \#* ]] && continue
    # shellcheck disable=SC2053
    [[ "$1" == $pattern ]] && { echo "$type"; return 0; }
  done <"$PONTOS"
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

# Os conflitos entre as pontas das frentes, uma linha por arquivo: "a<TAB>b<TAB>arquivo", com o b sendo a branch
# principal do remoto da base, escrita sem o remoto. Só o que está em commit entra, como no merge de verdade.
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
  # A branch principal do remoto, sem perguntar nada e sem esperar mais de 20 s: sem rede, vale a do último fetch.
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

# A pasta das travas da máquina: a `harness` do diretório comum do Git, a mesma onde a verificação completa põe a dela.
lock_dir() {
  echo "$(git rev-parse --path-format=absolute --git-common-dir)/harness"
}

# A trava dos slots: duas criações ao mesmo tempo nunca pegam o mesmo slot. Espera quem chegou depois, e sai
# com o processo.
lock_slots() {
  local dir
  dir="$(lock_dir)" && mkdir -p "$dir" || die "Não deu para abrir a pasta das travas da máquina."
  command -v flock >/dev/null || die "Falta o \`flock\` na máquina (o pacote util-linux), e o script trava os slots com ele."
  exec {SLOTS_LOCK_FD}>>"$dir/frentes.lock" && flock "$SLOTS_LOCK_FD" || die "Não deu para pegar a trava dos slots."
}

unlock_slots() {
  exec {SLOTS_LOCK_FD}>&-
}

cmd_novo() {
  local type="${2:-feature}" main folder branch slot
  parse_ticket "${1:-}" "frentes.sh novo <ticket> [tipo]"
  case "$type" in
    feature | bugfix | hotfix | docs) ;;
    *) die "O tipo \`$type\` não vale: a branch é feature, bugfix, hotfix ou docs (o padrão é feature)." ;;
  esac
  main="$(main_checkout)"
  folder="$(dirname "$main")/$(basename "$main")-$TICKET_KEY"
  branch="$type/$TICKET_KEY"

  # A rede antes da trava, para a espera de uma criação não esperar a rede da outra. Com duas criações ao mesmo tempo, os
  # dois fetch disputam a mesma ref e um pode falhar: ele tenta de novo, já com a ref atualizada pelo outro.
  git fetch -q "$BASE_REMOTE" "$BASE_BRANCH" 2>/dev/null || git fetch -q "$BASE_REMOTE" "$BASE_BRANCH" || die "Não deu para buscar a branch $BASE_BRANCH do remoto \`$BASE_REMOTE\`."
  lock_slots
  if [[ -n "$(ticket_worktrees "$TICKET_KEY")" ]]; then
    die "O ticket $1 já tem frente: $(ticket_worktrees "$TICKET_KEY" | cut -f 1 | paste -sd ' ')"
  fi
  if [[ "$(fronts | wc -l)" -ge "$LIMITE" ]]; then
    die "Já há $LIMITE frentes abertas, o limite de $LIMITE frentes ao todo (--limite), e o principal conta quando não está na $BASE_BRANCH." \
      "As abertas:" "$(cmd_listar)"
  fi
  slot="$(free_slot)" || die "Não há slot livre (1 a $LIMITE)."
  [[ -z "$AMBIENTE" ]] || "$AMBIENTE" verificar "$slot" ||
    die "O comando de ambiente da frente recusou o slot $slot, e nada foi criado."
  git worktree add -q --no-track -b "$branch" "$folder" "$BASE_REF" || die "Não deu para criar a pasta $folder e a branch $branch."
  store_slot "$folder" "$slot" || die "Não deu para gravar o slot da frente. A pasta $folder ficou, sem o slot; remova-a com o git worktree remove."
  unlock_slots
  [[ -z "$AMBIENTE" ]] || "$AMBIENTE" criar "$folder" "$slot" ||
    die "O ambiente da frente não ficou pronto. A pasta $folder ficou, com o slot $slot; veja o erro acima, corrija e rode de novo:" \
      "  $AMBIENTE criar $folder $slot"
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
  parse_ticket "$ticket" "frentes.sh remover <ticket> [--forcar]"
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

  [[ -z "$AMBIENTE" ]] || "$AMBIENTE" derrubar "$dir" || die "Não deu para derrubar o ambiente de $dir, e nada foi removido."
  # Sai da pasta antes de removê-la: chamado de dentro da frente, o `git branch -D` rodaria numa pasta que não existe mais.
  main="$(main_checkout)"
  cd "$main" || die "Não deu para entrar no checkout principal $main."
  git worktree remove "${force[@]}" "$dir" || die "Não deu para remover o worktree $dir."
  git branch -D "$branch" >/dev/null || die "O worktree saiu, mas não deu para apagar a branch $branch."
  echo "Frente do $ticket removida: $dir e a branch $branch."
}

# As opções do chamador, antes do subcomando.
while [[ $# -gt 0 ]]; do
  case "$1" in
    --limite | --ambiente | --pontos)
      [[ $# -ge 2 ]] || die "A opção $1 pede um valor."
      case "$1" in
        --limite) [[ "$2" =~ ^[1-9][0-9]*$ ]] || die "A opção --limite pede um número inteiro maior que zero, e veio \`$2\`."; LIMITE="$2" ;;
        --ambiente) AMBIENTE="$2" ;;
        --pontos) PONTOS="$2" ;;
      esac
      shift 2
      ;;
    -*) die "A opção \`$1\` não existe: as opções são --limite, --ambiente e --pontos, antes do subcomando." ;;
    *) break ;;
  esac
done

require_git_version
case "${1:-}" in
  novo) shift; cmd_novo "$@" ;;
  listar) cmd_listar ;;
  remover) shift; cmd_remover "$@" ;;
  *) die "Uso: frentes.sh [--limite <n>] [--ambiente <comando>] [--pontos <arquivo>] novo <ticket> [tipo] | listar | remover <ticket> [--forcar]" ;;
esac
