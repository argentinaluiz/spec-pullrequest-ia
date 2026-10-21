#!/usr/bin/env bash
#
# Testes do núcleo das frentes (scripts/frentes.sh), pela linha de comando, contra um remoto (bare) e um clone dele que
# faz de checkout principal, ambos temporários: a pasta, a branch, o `git worktree`, o slot e a trava são de verdade. Só
# o `gh` e o comando de ambiente da frente são trocados: o `gh` pelo modo de teste do harness (HARNESS_TEST=1), e o
# comando de ambiente por um programa deste teste, que registra o que recebeu. Rodam na máquina, porque usam o `git`, o
# `jq` e o `flock`. Os casos de aceite se ligam aos critérios pelo mapa de testes, e não pelo nome.

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPTS="$(cd "$HERE/.." && pwd)"
# shellcheck source=helpers.sh
source "$HERE/helpers.sh"

for tool in git jq flock; do
  command -v "$tool" >/dev/null || { echo "Falta o \`$tool\` na máquina: o teste do núcleo das frentes precisa dele."; exit 2; }
done

work="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$work"' EXIT
FRENTES="$SCRIPTS/frentes.sh"
GIT_ID=(-c user.name=t -c user.email=t@t)
# As opções que o chamador dá ao núcleo, antes do subcomando; cada caso as escolhe (o `fresh` as zera).
OPTS=()

# --- Os substitutos ---
export ENV_LOG="$work/ambiente.log" ENV_REFUSE="$work/ambiente-recusa" GH_STATES="$work/gh-states"
mkdir -p "$GH_STATES"
: >"$ENV_LOG"

# O `gh pr list --head <branch>`: responde o JSON que o caso gravou em $GH_STATES/<branch, com / virando _>.
cat >"$work/gh" <<'STUB'
#!/usr/bin/env bash
while [[ $# -gt 0 ]]; do
  [[ "$1" == --head ]] && head="$2"
  shift
done
file="$GH_STATES/${head//\//_}"
if [[ -f "$file" ]]; then cat "$file"; else echo '[]'; fi
STUB
# O comando de ambiente da frente, de mentira: registra cada chamada. O `verificar` registra quantos worktrees há (a
# pasta nova ainda não existe) e recusa o slot enquanto existir o arquivo ENV_REFUSE; devagar com ENV_SLOW, para abrir
# a janela em que duas criações sem trava pegariam o mesmo slot. O `criar` registra se a pasta já existe. O `portas`
# responde duas portas que dependem do slot.
cat >"$work/ambiente-falso" <<'STUB'
#!/usr/bin/env bash
case "$1" in
  verificar)
    echo "verificar $2 worktrees=$(git worktree list | wc -l)" >>"$ENV_LOG"
    if [[ -e "$ENV_REFUSE" ]]; then echo "o slot $2 está ocupado (de mentira)" >&2; exit 1; fi
    [[ -z "${ENV_SLOW:-}" ]] || sleep 0.2
    ;;
  criar) echo "criar $2 $3 pasta=$([[ -d "$2" ]] && echo existe || echo falta)" >>"$ENV_LOG" ;;
  derrubar) echo "derrubar $2" >>"$ENV_LOG" ;;
  portas) echo "9$2/8$2" ;;
esac
STUB
chmod +x "$work/gh" "$work/ambiente-falso"
AMBIENTE="$work/ambiente-falso"
export HARNESS_TEST=1 FRENTES_GH="$work/gh"
export HARNESS_BASE_REF=origin/main

# A seção dos pontos de convergência deste teste, no formato do arquivo de configuração: o tipo é a chave e o padrão, o
# valor. O `config pontos` a põe no arquivo do caso.
cat >"$work/pontos.conf" <<'CONF'
[convergencia]
	gerado = apps/api/openapi.json
	migracoes = apps/api/prisma/migrations/*
	registros = apps/api/src/app.module.ts
	documentos = docs/lld.md
	manual = apps/api/prisma/schema.prisma
	manual = apps/api/.env.example
CONF

# Um PATH só com o que o núcleo usa, sem o `docker`: o repositório de fora tem o Git e pouco mais.
mkdir -p "$work/so-git"
for tool in git jq flock sed awk tr cut head wc paste sort dirname basename cat mkdir tail grep bash env timeout; do
  ln -sf "$(command -v "$tool")" "$work/so-git/$tool"
done

# --- O remoto e o checkout principal ---
remote="$work/remoto.git"
seed="$work/semente"
git init -q --bare -b main "$remote"
git clone -q "$remote" "$seed" 2>/dev/null
git -C "$seed" checkout -q -b main
printf '.env\n' >"$seed/.gitignore"
mkdir -p "$seed/src" "$seed/apps/api/src" "$seed/apps/api/prisma/migrations/20260101000000_a" "$seed/docs"
echo "projeto" >"$seed/LEIAME.md"
echo "valor = base" >"$seed/src/codigo.ts"
echo '{"versao":"base"}' >"$seed/apps/api/openapi.json"
echo "lld base" >"$seed/docs/lld.md"
echo "-- base" >"$seed/apps/api/prisma/migrations/20260101000000_a/migration.sql"
echo "imports base" >"$seed/apps/api/src/app.module.ts"
git -C "$seed" add -A
git -C "$seed" "${GIT_ID[@]}" commit -q -m inicial
git -C "$seed" push -q origin main
# fresh <nome>: um checkout principal novo, em pasta própria (as frentes dele ficam ao lado), na main. Deixa o caminho em
# $repo e zera as opções, o registro do comando de ambiente e a recusa dele.
fresh() {
  OPTS=()
  : >"$ENV_LOG"
  rm -f "$ENV_REFUSE"
  mkdir -p "$work/$1"
  git clone -q "$remote" "$work/$1/principal"
  repo="$work/$1/principal"
}

# config [limite=<n>] [ambiente=<comando>] [pontos]: grava a configuração do caso em $work/worktree.conf, no formato do
# núcleo, e faz as $OPTS a usarem. O `pontos` põe nela a seção dos pontos de convergência deste teste.
config() {
  local arg
  {
    echo '[frentes]'
    for arg in "$@"; do
      case "$arg" in limite=* | ambiente=*) printf '\t%s = %s\n' "${arg%%=*}" "${arg#*=}" ;; esac
    done
    for arg in "$@"; do
      [[ "$arg" != pontos ]] || cat "$work/pontos.conf"
    done
  } >"$work/worktree.conf"
  OPTS=(--config "$work/worktree.conf")
}

# pr <branch> <número> <ABERTO|MERGEADO|FECHADO> [commit]: o `gh` passa a responder esse PR para a branch, com a
# ponta do PR (headRefOid) quando o commit é dado.
pr() {
  local state
  case "$3" in ABERTO) state=OPEN ;; MERGEADO) state=MERGED ;; *) state=CLOSED ;; esac
  printf '[{"number":%s,"state":"%s","headRefOid":"%s"}]\n' "$2" "$state" "${4:-}" >"$GH_STATES/${1//\//_}"
}

# change <pasta> <arquivo> <conteúdo>: grava o arquivo na pasta e faz o commit.
change() {
  mkdir -p "$(dirname "$1/$2")"
  printf '%s\n' "$3" >"$1/$2"
  git -C "$1" add -A
  git -C "$1" "${GIT_ID[@]}" commit -q -m "muda $2"
}

# snapshot <pasta...>: o estado das pastas que o listar não pode mudar: o status, o arquivo do índice e o
# commit da branch de cada uma.
snapshot() {
  local dir
  for dir in "$@"; do
    git -C "$dir" status --porcelain
    sha1sum "$(git -C "$dir" rev-parse --absolute-git-dir)/index"
    git -C "$dir" rev-parse HEAD
  done
}

# frentes <pasta> <argumentos...>: roda o núcleo na pasta, com as opções de $OPTS, a saída em $out e o código em $code.
frentes() {
  out="$(cd "$1" && "$FRENTES" "${OPTS[@]}" "${@:2}" 2>&1)"
  code=$?
}

contains() {
  [[ "$out" == *"$1"* ]]
}

# slot_of_front <pasta>: o slot guardado no diretório privado do Git do worktree.
slot_of_front() {
  cat "$(git -C "$1" rev-parse --absolute-git-dir)/frente-slot" 2>/dev/null
}

# --- O núcleo cria, lista e remove frentes num repositório só com o Git, com o limite e as recusas ---
git_only() {
  local front="$work/so-git-repo/principal-lui-1" line
  fresh so-git-repo
  # Sem Docker e sem comando de ambiente: um PATH só com o Git e o que o núcleo usa. As recusas (ticket repetido, PR aberto,
  # pasta suja, principal, Git antigo) são dos casos próprios, abaixo.
  PATH="$work/so-git" frentes "$repo" novo LUI-1
  [[ $code -eq 0 && "$(git -C "$front" branch --show-current)" == feature/lui-1 ]] || return 1
  contains "cd $front" && contains "claude" && [[ ! -e "$front/.env" ]] || return 1
  # O listar mostra o slot, a branch, o PR e os conflitos, e as portas como "-", porque não há comando de ambiente.
  pr feature/lui-1 5 ABERTO
  PATH="$work/so-git" frentes "$repo" listar
  [[ $code -eq 0 ]] && contains "CONFLITA COM" || return 1
  line="$(grep 'feature/lui-1 ' <<<"$out")"
  [[ "$line" == *" 1 "* && "$line" == *"#5 aberto"* && "$line" == *" - "* ]] || return 1
  # O limite se ajusta pela opção.
  config limite=1
  PATH="$work/so-git" frentes "$repo" novo LUI-2
  [[ $code -ne 0 ]] && contains "limite de 1 frentes" || return 1
  OPTS=()
  # O remover desmonta a frente de um PR mergeado com a pasta limpa.
  pr feature/lui-1 5 MERGEADO
  PATH="$work/so-git" frentes "$repo" remover LUI-1
  [[ $code -eq 0 && ! -e "$front" ]] && ! git -C "$repo" rev-parse --verify -q feature/lui-1 >/dev/null
}
check "o núcleo cria, lista e remove frentes num repositório só com o Git, com o limite e as recusas" git_only

# --- O núcleo chama o comando de ambiente da frente para verificar, criar e derrubar, e lista as portas que ele informa ---
environment_contract() {
  local front="$work/contrato/principal-lui-1"
  fresh contrato
  config ambiente="$AMBIENTE"
  frentes "$repo" novo LUI-1
  [[ $code -eq 0 ]] || return 1
  # O `verificar` vem com o slot antes de a pasta existir (só o principal está na lista), e o `criar` depois, com a pasta e o slot.
  [[ "$(<"$ENV_LOG")" == "verificar 1 worktrees=1"$'\n'"criar $front 1 pasta=existe" ]] || return 1

  # Recusado o slot, nada é criado e o `criar` não é chamado.
  : >"$ENV_LOG"
  : >"$ENV_REFUSE"
  frentes "$repo" novo LUI-2
  [[ $code -ne 0 ]] && contains "ocupado (de mentira)" && contains "nada foi criado" || return 1
  [[ ! -e "$work/contrato/principal-lui-2" ]] && ! git -C "$repo" rev-parse --verify -q feature/lui-2 >/dev/null || return 1
  grep -q '^verificar 2' "$ENV_LOG" && ! grep -q '^criar' "$ENV_LOG" || return 1
  rm "$ENV_REFUSE"

  # O listar mostra as portas que o `portas` informa para o slot da frente.
  pr feature/lui-1 5 ABERTO
  frentes "$repo" listar
  [[ $code -eq 0 && "$(grep 'feature/lui-1 ' <<<"$out")" == *" 91/81 "* ]] || return 1

  # O remover chama o `derrubar` com a pasta.
  pr feature/lui-1 5 MERGEADO
  : >"$ENV_LOG"
  frentes "$repo" remover LUI-1
  [[ $code -eq 0 ]] && grep -qxF "derrubar $front" "$ENV_LOG" && [[ ! -e "$front" ]]
}
check "o núcleo chama o comando de ambiente da frente para verificar, criar e derrubar, e lista as portas que ele informa" environment_contract

# --- O número da frente fica nela, apagar a pasta o libera e duas criações ao mesmo tempo nunca pegam o mesmo ---
slot_lives_in_the_front() {
  local one="$work/numero/principal-lui-1" two="$work/numero/principal-lui-2" common
  fresh numero
  frentes "$repo" novo LUI-1 && [[ $code -eq 0 ]] || return 1
  frentes "$repo" novo LUI-2 && [[ $code -eq 0 ]] || return 1
  # O menor número livre de 1 a 3, guardado no diretório privado do Git do worktree de cada uma.
  [[ "$(slot_of_front "$one")" == 1 && "$(slot_of_front "$two")" == 2 ]] || return 1
  # Nada na pasta da frente, nem no versionado nem fora dele, e nenhum registro central: a pasta das travas só tem a trava.
  [[ -z "$(git -C "$one" status --porcelain --ignored)" ]] || return 1
  [[ -z "$(find "$one" -path "$one/.git" -prune -o -name 'frente-slot' -print)" ]] || return 1
  common="$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir)"
  [[ "$(ls "$common/harness")" == frentes.lock ]] || return 1
  # Apagar a pasta da primeira, sem o remover, libera o número dela para a próxima.
  rm -rf "$one"
  frentes "$repo" listar
  [[ $code -eq 0 && "$out" != *principal-lui-1* ]] || return 1
  frentes "$repo" novo LUI-3
  [[ $code -eq 0 && "$(slot_of_front "$work/numero/principal-lui-3")" == 1 ]]
}
check "o número da frente fica nela, apagar a pasta o libera e duas criações ao mesmo tempo nunca pegam o mesmo" slot_lives_in_the_front

# --- Duas criações ao mesmo tempo recebem slots diferentes ---
concurrent_creations() {
  local a b slots
  fresh simultaneas
  config ambiente="$AMBIENTE"
  (cd "$repo" && ENV_SLOW=1 "$FRENTES" "${OPTS[@]}" novo LUI-1 >"$work/simultaneas-a.out" 2>&1) &
  a=$!
  (cd "$repo" && ENV_SLOW=1 "$FRENTES" "${OPTS[@]}" novo LUI-2 >"$work/simultaneas-b.out" 2>&1) &
  b=$!
  wait "$a" "$b" || { cat "$work"/simultaneas-?.out; return 1; }
  # Slots diferentes: uma frente tem o 1 e a outra, o 2, em qualquer ordem.
  slots="$(slot_of_front "$work/simultaneas/principal-lui-1")$(slot_of_front "$work/simultaneas/principal-lui-2")"
  [[ "$slots" == 12 || "$slots" == 21 ]]
}
check "duas criações ao mesmo tempo recebem slots diferentes" concurrent_creations

# --- O novo cria a pasta e a branch a partir da base buscada e escolhe o menor slot livre ---
creation() {
  local front="$work/criacao/principal-lui-186" second="$work/criacao/principal-lui-187"
  fresh criacao
  # A main do remoto anda depois do clone: a frente tem de nascer dela, e não da main do clone.
  change "$seed" chegou-depois.txt "chegou depois do clone"
  git -C "$seed" push -q origin main
  frentes "$repo" novo LUI-186
  [[ $code -eq 0 ]] || return 1
  # A pasta irmã, na branch do ticket, nascida da main que o remoto tem agora.
  [[ "$(git -C "$front" branch --show-current)" == feature/lui-186 ]] || return 1
  [[ -f "$front/chegou-depois.txt" ]] || return 1
  [[ "$(slot_of_front "$front")" == 1 ]] || return 1
  contains "cd $front" && contains "claude" || return 1

  # Com o tipo dado, a branch leva o tipo; com o slot 1 ocupado, a frente seguinte pega o 2.
  frentes "$repo" novo LUI-187 bugfix
  [[ $code -eq 0 ]] || return 1
  [[ "$(git -C "$second" branch --show-current)" == bugfix/lui-187 ]] && [[ "$(slot_of_front "$second")" == 2 ]]
}
check "o novo cria a pasta e a branch a partir da base buscada, escolhe o menor slot livre e imprime o comando de abrir a sessão" creation

# --- O listar mostra slot, branch, portas e estado do PR de cada frente, com o principal quando é frente ---
listing() {
  local line
  fresh listagem
  config ambiente="$AMBIENTE"
  git -C "$repo" checkout -q -b feature/principal-da-vez
  frentes "$repo" novo LUI-10 && [[ $code -eq 0 ]] || return 1
  frentes "$repo" novo LUI-11 && [[ $code -eq 0 ]] || return 1
  pr feature/lui-10 5 ABERTO
  pr feature/lui-11 6 MERGEADO

  frentes "$repo" listar
  [[ $code -eq 0 ]] || return 1
  # Uma linha por frente: pasta, slot, branch, portas e o estado do PR.
  line="$(grep 'feature/lui-10' <<<"$out")"
  [[ "$line" == *principal-lui-10* && "$line" == *" 1 "* && "$line" == *91/81* && "$line" == *"#5 aberto"* ]] || return 1
  line="$(grep 'feature/lui-11' <<<"$out")"
  [[ "$line" == *" 2 "* && "$line" == *92/82* && "$line" == *"#6 mergeado"* ]] || return 1
  # O principal, numa branch que não é a main, é uma frente: slot 0, e a branch sem PR.
  line="$(grep 'feature/principal-da-vez' <<<"$out")"
  [[ "$line" == *" 0 "* && "$line" == *90/80* && "$line" == *"sem PR"* ]] || return 1

  # Com o principal na main, ele não é frente e não aparece.
  git -C "$repo" checkout -q main
  frentes "$repo" listar
  [[ "$out" != *90/80* && "$out" == *feature/lui-10* ]]
}
check "o listar mostra slot, branch, portas e estado do PR de cada frente, com o principal quando ele é frente" listing

# --- O novo recusa a quarta frente, contando o principal fora da main, e mostra as abertas ---
limit() {
  fresh limite
  git -C "$repo" checkout -q -b feature/principal-da-vez
  frentes "$repo" novo LUI-1 && [[ $code -eq 0 ]] || return 1
  frentes "$repo" novo LUI-2 && [[ $code -eq 0 ]] || return 1

  # O principal (fora da main) e as duas frentes são as três: a quarta é recusada, com a lista.
  frentes "$repo" novo LUI-3
  [[ $code -ne 0 ]] && contains "limite de 3 frentes" || return 1
  contains "feature/principal-da-vez" && contains "feature/lui-1" && contains "feature/lui-2" || return 1
  [[ ! -e "$work/limite/principal-lui-3" ]] && ! git -C "$repo" rev-parse --verify -q feature/lui-3 >/dev/null || return 1

  # Com o principal na main, as mesmas duas frentes deixam espaço para a terceira.
  git -C "$repo" checkout -q main
  frentes "$repo" novo LUI-3 && [[ $code -eq 0 ]] || return 1

  # O limite se ajusta pela opção: com 1, a segunda frente é recusada.
  fresh limite-um
  config limite=1
  frentes "$repo" novo LUI-1 && [[ $code -eq 0 ]] || return 1
  frentes "$repo" novo LUI-2
  [[ $code -ne 0 ]] && contains "limite de 1 frentes"
}
check "o novo recusa a quarta frente, contando o principal fora da main, e mostra as abertas" limit

# --- O remover recusa o PR não mergeado e a pasta suja, recusa o principal, e remove a mergeada e limpa ---
removal() {
  local front
  fresh remocao
  config ambiente="$AMBIENTE"
  front="$work/remocao/principal-lui-1"
  frentes "$repo" novo LUI-1 && [[ $code -eq 0 ]] || return 1
  : >"$ENV_LOG"

  # PR aberto: recusa, dizendo o estado, e não mexe em nada.
  pr feature/lui-1 5 ABERTO
  frentes "$repo" remover LUI-1
  [[ $code -ne 0 ]] && contains "#5 aberto" && [[ -d "$front" ]] && ! grep -q "derrubar" "$ENV_LOG" || return 1

  # PR mergeado e pasta com arquivo novo fora do .gitignore: recusa, dizendo o arquivo.
  pr feature/lui-1 5 MERGEADO
  echo x >"$front/sobrou.txt"
  frentes "$repo" remover LUI-1
  [[ $code -ne 0 ]] && contains "sobrou.txt" && [[ -d "$front" ]] && ! grep -q "derrubar" "$ENV_LOG" || return 1
  rm "$front/sobrou.txt"
  # E com uma mudança num arquivo versionado.
  echo mudou >>"$front/LEIAME.md"
  frentes "$repo" remover LUI-1
  [[ $code -ne 0 ]] && contains "LEIAME.md" && [[ -d "$front" ]] && ! grep -q "derrubar" "$ENV_LOG" &&
    git -C "$repo" rev-parse --verify -q feature/lui-1 >/dev/null || return 1
  git -C "$front" checkout -q -- LEIAME.md

  # O checkout principal numa branch de ticket, com o PR mergeado e a pasta limpa: nunca é removido.
  git -C "$repo" checkout -q -b feature/lui-9-com-sufixo
  pr feature/lui-9-com-sufixo 9 MERGEADO
  frentes "$repo" remover LUI-9
  [[ $code -ne 0 ]] && contains "principal" && [[ -d "$repo/.git" ]] || return 1
  git -C "$repo" checkout -q main

  # PR mergeado e pasta limpa: derruba o ambiente, tira o worktree e a branch.
  frentes "$repo" remover LUI-1
  [[ $code -eq 0 ]] || return 1
  grep -qxF "derrubar $front" "$ENV_LOG" &&
    [[ ! -e "$front" ]] &&
    ! git -C "$repo" worktree list | grep -q lui-1 &&
    ! git -C "$repo" rev-parse --verify -q feature/lui-1 >/dev/null
}
check "o remover recusa o PR não mergeado e a pasta suja, recusa o principal, e remove a frente mergeada e limpa" removal

# --- O remover --forcar remove a frente sem merge (o hook que o nega ao agente é testado à parte) ---
forced_removal() {
  local front
  fresh forcada
  config ambiente="$AMBIENTE"
  front="$work/forcada/principal-lui-1"
  frentes "$repo" novo LUI-1 && [[ $code -eq 0 ]] || return 1
  : >"$ENV_LOG"
  # Com o PR aberto e a pasta suja, a opção remove tudo.
  pr feature/lui-1 5 ABERTO
  echo x >"$front/sobrou.txt"
  frentes "$repo" remover --forcar LUI-1
  [[ $code -eq 0 ]] || return 1
  grep -qxF "derrubar $front" "$ENV_LOG" &&
    [[ ! -e "$front" ]] &&
    ! git -C "$repo" rev-parse --verify -q feature/lui-1 >/dev/null
}
check "o remover --forcar remove a frente sem merge" forced_removal

# --- O núcleo recusa o Git abaixo da versão mínima, dizendo qual ela é ---
old_git() {
  local invocation
  fresh git-antigo
  for invocation in "novo LUI-1" listar "remover LUI-1"; do
    # shellcheck disable=SC2086
    out="$(cd "$repo" && FRENTES_GIT_VERSION=2.30.1 "$FRENTES" $invocation 2>&1)"
    [[ $? -ne 0 ]] && contains "2.38" && contains "2.30.1" && contains "Atualize o Git" || return 1
  done
  # Recusou antes de mexer em qualquer coisa.
  [[ ! -e "$work/git-antigo/principal-lui-1" ]] || return 1
  # Na versão mínima, segue.
  out="$(cd "$repo" && FRENTES_GIT_VERSION=2.38.0 "$FRENTES" novo LUI-1 2>&1)"
  [[ $? -eq 0 && -d "$work/git-antigo/principal-lui-1" ]]
}
check "o núcleo recusa o Git abaixo da versão mínima, dizendo qual ela é" old_git

# --- Um ticket com mais de uma frente não se remove às cegas, e não ganha uma segunda ---
ticket_identity() {
  fresh ticket
  frentes "$repo" novo LUI-1 && [[ $code -eq 0 ]] || return 1
  # Uma segunda frente do mesmo ticket é recusada, mesmo com outro tipo.
  frentes "$repo" novo LUI-1 bugfix
  [[ $code -ne 0 ]] && contains "já tem frente" || return 1
  # LUI-10 não é LUI-1: o número inteiro conta.
  frentes "$repo" novo LUI-10 && [[ $code -eq 0 ]] || return 1
  # Duas branches do mesmo ticket (uma feita à mão, com sufixo): o remover recusa e não remove nenhuma.
  git -C "$repo" worktree add -q -b bugfix/lui-1-a-mao "$work/ticket/a-mao" origin/main
  pr feature/lui-1 5 MERGEADO
  frentes "$repo" remover LUI-1
  [[ $code -ne 0 ]] && contains "mais de uma frente" && [[ -d "$work/ticket/principal-lui-1" && -d "$work/ticket/a-mao" ]]
}
check "um ticket com mais de uma frente não se remove às cegas, e não ganha uma segunda" ticket_identity

# --- As entradas inválidas são recusadas antes de mexer em qualquer coisa ---
invalid_input() {
  fresh invalidas
  # O tipo da branch é um dos quatro da convenção.
  frentes "$repo" novo LUI-1 feture
  [[ $code -ne 0 ]] && contains "feature, bugfix, hotfix ou docs" && [[ ! -e "$work/invalidas/principal-lui-1" ]] || return 1
  # As opções do núcleo: uma que não existe, a --config sem valor, um arquivo que não existe e um limite que não é número.
  OPTS=(--nada)
  frentes "$repo" listar
  [[ $code -ne 0 ]] && contains "a única opção é --config" || return 1
  OPTS=(--config)
  frentes "$repo"
  [[ $code -ne 0 ]] && contains "pede um valor" || return 1
  OPTS=(--config "$work/nao-existe.conf")
  frentes "$repo" listar
  [[ $code -ne 0 ]] && contains "nao-existe.conf" && contains "não existe" || return 1
  config limite=tres
  frentes "$repo" listar
  [[ $code -ne 0 ]] && contains "frentes.limite" && contains "número inteiro" || return 1
  OPTS=()
  # O remover recusa um ticket a mais e uma opção que não conhece, em vez de escolher um deles.
  frentes "$repo" novo LUI-1 && [[ $code -eq 0 ]] || return 1
  frentes "$repo" remover LUI-1 LUI-2
  [[ $code -ne 0 ]] && contains "um ticket só" || return 1
  frentes "$repo" remover LUI-1 --force
  [[ $code -ne 0 ]] && contains "opção" && [[ -d "$work/invalidas/principal-lui-1" ]] || return 1
  # Uma branch feita à mão com o ticket em maiúsculas também é a frente do ticket.
  git -C "$repo" worktree add -q -b feature/LUI-5-a-mao "$work/invalidas/a-mao" origin/main
  frentes "$repo" novo LUI-5
  [[ $code -ne 0 ]] && contains "já tem frente" || return 1
  # Um checkout principal em HEAD solto é uma frente, e o listar não pergunta ao gh por uma branch vazia.
  git -C "$repo" checkout -q --detach
  frentes "$repo" listar
  [[ $code -eq 0 ]] && contains "(HEAD solto)" && contains "sem PR"
}
check "as entradas inválidas são recusadas, e a branch em maiúsculas e o HEAD solto são tratados" invalid_input

# --- O listar mostra os conflitos entre as frentes e contra a main, sem mudar nada ---
conflicts_column() {
  local a="$work/conflitos/principal-lui-1" b="$work/conflitos/principal-lui-2" c="$work/conflitos/principal-lui-3" before after line
  fresh conflitos
  frentes "$repo" novo LUI-1 && [[ $code -eq 0 ]] || return 1
  frentes "$repo" novo LUI-2 && [[ $code -eq 0 ]] || return 1
  frentes "$repo" novo LUI-3 && [[ $code -eq 0 ]] || return 1
  # As frentes 1 e 2 mudam a mesma linha do mesmo arquivo, e a 3 mexe num arquivo que ninguém toca.
  change "$a" src/codigo.ts "valor = um"
  change "$b" src/codigo.ts "valor = dois"
  change "$c" src/outro.ts "valor = tres"
  # A main do remoto anda e muda a mesma linha: as frentes 1 e 2 passam a conflitar com ela, a 3 não.
  change "$seed" src/codigo.ts "valor = main"
  git -C "$seed" push -q origin main

  before="$(snapshot "$a" "$b" "$c" "$repo")"
  frentes "$repo" listar
  after="$(snapshot "$a" "$b" "$c" "$repo")"
  [[ $code -eq 0 && "$before" == "$after" ]] || return 1

  # A coluna: a frente 1 conflita com a 2 e com a main; a 3 com ninguém.
  line="$(grep 'feature/lui-1 ' <<<"$out" | head -n 1)"
  [[ "$line" == *lui-2* && "$line" == *main* ]] || return 1
  line="$(grep 'feature/lui-3 ' <<<"$out" | head -n 1)"
  [[ "$line" != *lui-1* && "$line" != *lui-2* && "$line" != *"conflita"* ]] || return 1
  # A seção: o par 1 e 2, e cada uma contra a main, com o arquivo; o par 1 e 3 não aparece.
  contains "feature/lui-1 × feature/lui-2" && contains "feature/lui-1 × main" && contains "feature/lui-2 × main" || return 1
  contains "src/codigo.ts" || return 1
  [[ "$out" != *"feature/lui-1 × feature/lui-3"* && "$out" != *"feature/lui-3 × main"* ]]
}
check "o listar mostra, para cada par de frentes e para cada frente contra a main, se há conflito e em quais arquivos, sem mudar nada" conflicts_column

# --- O conflito em ponto de convergência com regra mecânica aparece à parte, com o tipo ---
convergence_split() {
  local a="$work/pontos/principal-lui-1" b="$work/pontos/principal-lui-2" mechanical attention file
  fresh pontos
  config pontos
  frentes "$repo" novo LUI-1 && [[ $code -eq 0 ]] || return 1
  frentes "$repo" novo LUI-2 && [[ $code -eq 0 ]] || return 1
  # As duas frentes mudam, cada uma do seu jeito, um arquivo de cada tipo e um de código.
  for file in apps/api/openapi.json apps/api/prisma/migrations/20260101000000_a/migration.sql apps/api/src/app.module.ts \
    apps/api/prisma/schema.prisma apps/api/.env.example docs/lld.md src/codigo.ts; do
    change "$a" "$file" "versao do um"
    change "$b" "$file" "versao do dois"
  done

  frentes "$repo" listar
  [[ $code -eq 0 ]] || return 1
  # Os pontos de convergência com regra mecânica ficam à parte, cada um com o tipo.
  mechanical="$(sed -n '/ponto de convergência (regra mecânica):/,/pede atenção:/p' <<<"$out")"
  [[ "$mechanical" == *"gerado: apps/api/openapi.json"* ]] || return 1
  [[ "$mechanical" == *"migracoes: apps/api/prisma/migrations/20260101000000_a/migration.sql"* ]] || return 1
  [[ "$mechanical" == *"registros: apps/api/src/app.module.ts"* ]] || return 1
  # O código e o documento pedem atenção, o documento com o tipo dele, e nenhum dos dois cai no grupo mecânico.
  attention="$(sed -n '/pede atenção:/,$p' <<<"$out")"
  [[ "$attention" == *"src/codigo.ts"* && "$attention" == *"docs/lld.md (documentos)"* ]] || return 1
  [[ "$mechanical" != *"src/codigo.ts"* && "$mechanical" != *"docs/lld.md"* ]] || return 1
  [[ "$attention" != *"openapi.json"* && "$attention" != *"app.module.ts"* ]] || return 1
  # O schema e o arquivo de variáveis se juntam à mão: pedem atenção, com o tipo manual, e não são mecânicos.
  [[ "$attention" == *"apps/api/prisma/schema.prisma (manual)"* && "$attention" == *"apps/api/.env.example (manual)"* ]] || return 1
  [[ "$mechanical" != *"schema.prisma"* && "$mechanical" != *".env.example"* ]] || return 1

  # Sem o arquivo dos pontos, todo arquivo em conflito é código e pede atenção, sem grupo mecânico.
  OPTS=()
  frentes "$repo" listar
  [[ $code -eq 0 && "$out" != *"regra mecânica"* ]] && contains "apps/api/openapi.json" && [[ "$out" != *"(documentos)"* ]]
}
check "o conflito em ponto de convergência com regra mecânica aparece à parte, com o tipo, e o de código, o de documento e o manual (schema e arquivo de variáveis) pedem atenção" convergence_split

# --- O núcleo acha a configuração do projeto em .config/worktree do checkout, sem opção ---
default_config() {
  fresh configuracao
  mkdir -p "$repo/.config" "$repo/bin"
  cp "$AMBIENTE" "$repo/bin/ambiente"
  # O caminho do comando de ambiente é relativo à raiz do checkout, e o limite e os pontos vêm do mesmo arquivo.
  printf '[frentes]\n\tlimite = 1\n\tambiente = bin/ambiente\n' >"$repo/.config/worktree"
  frentes "$repo" novo LUI-1
  [[ $code -eq 0 ]] && grep -q '^criar' "$ENV_LOG" || return 1
  frentes "$repo" novo LUI-2
  [[ $code -ne 0 ]] && contains "limite de 1 frentes" || return 1
  # A opção --config vale mais que o arquivo do checkout.
  config limite=3
  frentes "$repo" novo LUI-2
  [[ $code -eq 0 ]]
}
check "o núcleo lê o limite e o comando de ambiente de .config/worktree do checkout, com o caminho relativo à raiz dele, e a opção --config vale mais" default_config

# --- Na classificação dos pontos vale o primeiro padrão que casa ---
first_match_wins() {
  local a="$work/ordem/principal-lui-1" b="$work/ordem/principal-lui-2"
  fresh ordem
  printf '[convergencia]\n\tdocumentos = docs/*\n\tmanual = docs/lld.md\n' >"$work/ordem.conf"
  OPTS=(--config "$work/ordem.conf")
  frentes "$repo" novo LUI-1 && [[ $code -eq 0 ]] || return 1
  frentes "$repo" novo LUI-2 && [[ $code -eq 0 ]] || return 1
  change "$a" docs/lld.md "versao do um"
  change "$b" docs/lld.md "versao do dois"
  frentes "$repo" listar
  [[ $code -eq 0 ]] && contains "docs/lld.md (documentos)" && [[ "$out" != *"(manual)"* ]]
}
check "na classificação dos pontos de convergência vale o primeiro padrão que casa, na ordem do arquivo" first_match_wins

# --- Um erro ao calcular o merge é dito, e não passa por "sem conflito"; o nome com acento sai sem aspas ---
conflict_errors() {
  local a="$work/erro/principal-lui-1" b="$work/erro/principal-lui-2"
  fresh erro
  frentes "$repo" novo LUI-1 && [[ $code -eq 0 ]] || return 1
  frentes "$repo" novo LUI-2 && [[ $code -eq 0 ]] || return 1
  change "$a" "src/ação.ts" "versao do um"
  change "$b" "src/ação.ts" "versao do dois"
  # O nome com acento sai como é, sem as aspas e as barras do Git.
  frentes "$repo" listar
  [[ $code -eq 0 ]] && contains "src/ação.ts" && [[ "$out" != *'\303'* ]] || return 1
  # Uma base que não existe: o merge contra ela falha, e o listar diz que não calculou, em vez de aprovar.
  out="$(cd "$repo" && HARNESS_BASE_REF=origin/nao-existe "$FRENTES" listar 2>&1)"
  [[ $? -eq 0 ]] && contains "não deu para calcular" && [[ "$out" != *"(não deu para calcular)"*"pede atenção"* ]]
}
check "um erro ao calcular o merge é dito, e não passa por sem conflito, e o nome com acento sai sem aspas" conflict_errors

# --- A branch da frente nasce sem upstream: o `git push` comum não tem a main como destino ---
no_upstream() {
  fresh upstream
  frentes "$repo" novo LUI-1 && [[ $code -eq 0 ]] || return 1
  ! git -C "$work/upstream/principal-lui-1" rev-parse --abbrev-ref '@{upstream}' >/dev/null 2>&1
}
check "o novo cria a branch sem upstream, para o git push comum não apontar para a main" no_upstream

# --- A frente cuja pasta foi apagada à mão deixa de contar para o limite, e some do listar ---
deleted_folder() {
  fresh apagada
  frentes "$repo" novo LUI-1 && [[ $code -eq 0 ]] || return 1
  frentes "$repo" novo LUI-2 && [[ $code -eq 0 ]] || return 1
  frentes "$repo" novo LUI-3 && [[ $code -eq 0 ]] || return 1
  frentes "$repo" novo LUI-4
  [[ $code -ne 0 ]] && contains "Já há 3 frentes" || return 1
  rm -rf "$work/apagada/principal-lui-1" "$work/apagada/principal-lui-2"
  frentes "$repo" listar
  [[ $code -eq 0 ]] && ! contains "lui-1" && ! contains "lui-2" && contains "lui-3" || return 1
  frentes "$repo" novo LUI-4
  [[ $code -eq 0 && "$(slot_of_front "$work/apagada/principal-lui-4")" == 1 ]]
}
check "a frente com a pasta apagada à mão não conta para o limite de três, e o slot dela fica livre" deleted_folder

# --- O remover só apaga a branch que o PR mergeado já contém ---
remove_tip() {
  local front tip
  fresh ponta
  config ambiente="$AMBIENTE"
  front="$work/ponta/principal-lui-1"
  frentes "$repo" novo LUI-1 && [[ $code -eq 0 ]] || return 1
  tip="$(git -C "$front" rev-parse HEAD)"
  # O PR mergeado tem a ponta da branch; depois do merge, um commit local novo: recusa, e nada sai.
  pr feature/lui-1 5 MERGEADO "$tip"
  change "$front" "depois-do-merge.txt" "trabalho novo"
  : >"$ENV_LOG"
  frentes "$repo" remover LUI-1
  [[ $code -ne 0 ]] && contains "commits que o PR mergeado não tem" && [[ -d "$front" ]] &&
    ! grep -q "derrubar" "$ENV_LOG" && git -C "$repo" rev-parse --verify -q feature/lui-1 >/dev/null || return 1
  # Um PR novo e aberto na mesma branch vale mais que o mergeado antigo: a frente está em uso.
  printf '[{"number":5,"state":"MERGED","headRefOid":"%s"},{"number":9,"state":"OPEN","headRefOid":"%s"}]\n' \
    "$tip" "$(git -C "$front" rev-parse HEAD)" >"$GH_STATES/feature_lui-1"
  frentes "$repo" remover LUI-1
  [[ $code -ne 0 ]] && contains "#9 aberto" && [[ -d "$front" ]] || return 1
  # Com a ponta do PR igual à da branch, remove.
  pr feature/lui-1 9 MERGEADO "$(git -C "$front" rev-parse HEAD)"
  frentes "$repo" remover LUI-1
  [[ $code -eq 0 ]] && [[ ! -e "$front" ]] && ! git -C "$repo" rev-parse --verify -q feature/lui-1 >/dev/null
}
check "o remover recusa a branch com commits que o PR mergeado não tem e o PR novo aberto, e remove quando a ponta é a do PR" remove_tip

# --- O remover chamado de dentro da própria frente também apaga a branch ---
remove_from_inside() {
  local front
  fresh dentro
  front="$work/dentro/principal-lui-1"
  frentes "$repo" novo LUI-1 && [[ $code -eq 0 ]] || return 1
  pr feature/lui-1 5 MERGEADO
  frentes "$front" remover LUI-1
  [[ $code -eq 0 ]] && [[ ! -e "$front" ]] && ! git -C "$repo" rev-parse --verify -q feature/lui-1 >/dev/null
}
check "o remover chamado de dentro da frente tira o worktree e apaga a branch" remove_from_inside

finish "do núcleo das frentes"
