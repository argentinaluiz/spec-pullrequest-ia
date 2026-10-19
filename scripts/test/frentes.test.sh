#!/usr/bin/env bash
#
# Testes do script de frentes (scripts/frentes.sh), pela linha de comando, contra um remoto (bare) e um
# clone dele que faz de checkout principal, ambos temporários: a pasta, a branch, o `.env`, o
# `git worktree` e a trava são de verdade. Só o `docker`, o `gh` e a sonda de portas são trocados, pelo
# modo de teste do harness (HARNESS_TEST=1): programas deste teste, que registram o que receberam ou
# respondem o que o caso combinou. Rodam na máquina, porque usam o `git`, o `jq` e o `flock`. Quem chama
# é o scripts/verify.sh.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=sh-helpers.sh
source "$ROOT/scripts/test/sh-helpers.sh"

for tool in git jq flock; do
  command -v "$tool" >/dev/null || { echo "Falta o \`$tool\` na máquina: o teste do script de frentes precisa dele."; exit 2; }
done

work="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$work"' EXIT
FRENTES="$ROOT/scripts/frentes.sh"
GIT_ID=(-c user.name=t -c user.email=t@t)

# --- Os substitutos do modo de teste ---
export DOCKER_LOG="$work/docker.log" GH_STATES="$work/gh-states" BUSY_PORTS="$work/busy-ports"
mkdir -p "$GH_STATES"
: >"$DOCKER_LOG"
: >"$BUSY_PORTS"

# O `docker`: registra a pasta e os argumentos.
cat >"$work/docker" <<'STUB'
#!/usr/bin/env bash
echo "$PWD|$*" >>"$DOCKER_LOG"
STUB
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
# A sonda de portas: diz quem ocupa a porta dada, pelas linhas "<porta> <processo>" de $BUSY_PORTS.
cat >"$work/port-owner" <<'STUB'
#!/usr/bin/env bash
sed -n "s/^$1 //p" "$BUSY_PORTS"
STUB
# A mesma sonda, devagar: a conferência das portas fica entre a escolha do slot e a gravação dele, e a lentidão
# abre ali a janela em que duas criações sem trava pegariam o mesmo slot.
cat >"$work/port-owner-slow" <<STUB
#!/usr/bin/env bash
sleep 0.2
exec "$work/port-owner" "\$1"
STUB
chmod +x "$work/docker" "$work/gh" "$work/port-owner" "$work/port-owner-slow"
export HARNESS_TEST=1 FRENTES_DOCKER="$work/docker" FRENTES_GH="$work/gh" FRENTES_PORT_OWNER="$work/port-owner"
export HARNESS_BASE_REF=origin/main

# --- O remoto e o checkout principal ---
remote="$work/remoto.git"
seed="$work/semente"
principal="$work/principal"
git init -q --bare -b main "$remote"
git clone -q "$remote" "$seed" 2>/dev/null
git -C "$seed" checkout -q -b main
echo "services: {}" >"$seed/compose.dev.yaml"
printf '.env\n' >"$seed/.gitignore"
git -C "$seed" add -A
git -C "$seed" "${GIT_ID[@]}" commit -q -m inicial
git -C "$seed" push -q origin main
git clone -q "$remote" "$principal"
# A main do remoto anda depois do clone: a frente tem de nascer dela, e não da main do clone.
echo "chegou depois do clone" >"$seed/chegou-depois.txt"
git -C "$seed" add -A
git -C "$seed" "${GIT_ID[@]}" commit -q -m "chegou depois"
git -C "$seed" push -q origin main

# fresh <nome>: um checkout principal novo, em pasta própria (as frentes dele ficam ao lado), na main.
# Deixa o caminho em $repo.
fresh() {
  : >"$BUSY_PORTS"
  mkdir -p "$work/$1"
  git clone -q "$remote" "$work/$1/principal"
  repo="$work/$1/principal"
}

# pr <branch> <número> <ABERTO|MERGEADO|FECHADO>: o `gh` passa a responder esse PR para a branch.
pr() {
  local state
  case "$3" in ABERTO) state=OPEN ;; MERGEADO) state=MERGED ;; *) state=CLOSED ;; esac
  printf '[{"number":%s,"state":"%s"}]\n' "$2" "$state" >"$GH_STATES/${1//\//_}"
}

# frentes <pasta> <argumentos...>: roda o script na pasta, com a saída em $out e o código em $code.
frentes() {
  out="$(cd "$1" && "$FRENTES" "${@:2}" 2>&1)"
  code=$?
}

contains() {
  [[ "$out" == *"$1"* ]]
}

# env_has <pasta> <linha>: o `.env` da pasta traz a linha.
env_has() {
  grep -qxF -- "$2" "$1/.env" 2>/dev/null
}

# --- CA1: o novo cria a pasta e a branch a partir da main buscada, grava o .env, sobe o ambiente ---
ca1() {
  local front="$work/principal-lui-186" second="$work/principal-lui-187" line
  frentes "$principal" novo LUI-186
  [[ $code -eq 0 ]] || return 1
  # A pasta irmã, na branch do ticket, nascida da main que o remoto tem agora.
  [[ "$(git -C "$front" branch --show-current)" == feature/lui-186 ]] || return 1
  [[ -f "$front/chegou-depois.txt" ]] || return 1
  # O `.env` do slot 1, pelo contrato da LLD.
  for line in SLOT=1 WEB_PORT=3010 API_PORT=3011 STORAGE_PORT=4453 MAILPIT_PORT=8035 \
    WEB_ORIGIN=http://localhost:3010 STORAGE_PUBLIC_URL=http://localhost:4453 \
    STORAGE_EMULATOR_HOST=http://storage:4453 GIT_MASK_TYPE=bind GIT_MASK_SOURCE=/dev/null; do
    env_has "$front" "$line" || return 1
  done
  # O ambiente sobe na pasta nova, esperando ficar pronto, e o comando de abrir a sessão sai.
  grep -qxF -- "$front|compose -f compose.dev.yaml up -d --build --wait" "$DOCKER_LOG" || return 1
  contains "cd $front" && contains "claude" || return 1

  # Com o tipo dado, a branch leva o tipo; com o slot 1 ocupado, a frente seguinte pega o 2.
  frentes "$principal" novo LUI-187 bugfix
  [[ $code -eq 0 ]] || return 1
  [[ "$(git -C "$second" branch --show-current)" == bugfix/lui-187 ]] &&
    env_has "$second" SLOT=2 && env_has "$second" WEB_PORT=3020 && env_has "$second" MAILPIT_PORT=8045
}
check "o novo cria a pasta e a branch a partir da main buscada, grava o .env do menor slot livre, sobe o ambiente e imprime o comando de abrir a sessão @LUI-186-CA1" ca1

# --- CA5: o listar mostra slot, branch, portas e estado do PR de cada frente, com o principal quando é frente ---
ca5() {
  local line
  fresh ca5
  git -C "$repo" checkout -q -b feature/principal-da-vez
  frentes "$repo" novo LUI-10 && [[ $code -eq 0 ]] || return 1
  frentes "$repo" novo LUI-11 && [[ $code -eq 0 ]] || return 1
  pr feature/lui-10 5 ABERTO
  pr feature/lui-11 6 MERGEADO

  frentes "$repo" listar
  [[ $code -eq 0 ]] || return 1
  # Uma linha por frente: pasta, slot, branch, portas (web, API, storage e e-mails) e o estado do PR.
  line="$(grep 'feature/lui-10' <<<"$out")"
  [[ "$line" == *principal-lui-10* && "$line" == *" 1 "* && "$line" == *3010/3011/4453/8035* && "$line" == *"#5 aberto"* ]] || return 1
  line="$(grep 'feature/lui-11' <<<"$out")"
  [[ "$line" == *" 2 "* && "$line" == *3020/3021/4463/8045* && "$line" == *"#6 mergeado"* ]] || return 1
  # O principal, numa branch que não é a main, é uma frente: slot 0, as portas de hoje, e a branch sem PR.
  line="$(grep 'feature/principal-da-vez' <<<"$out")"
  [[ "$line" == *" 0 "* && "$line" == *3000/3001/4443/8025* && "$line" == *"sem PR"* ]] || return 1

  # Com o principal na main, ele não é frente e não aparece.
  git -C "$repo" checkout -q main
  frentes "$repo" listar
  [[ "$out" != *3000/3001/4443/8025* && "$out" == *feature/lui-10* ]]
}
check "o listar mostra slot, branch, portas e estado do PR de cada frente, com o principal quando ele é frente @LUI-186-CA5" ca5

# --- CA2: o novo recusa a quarta frente, contando o principal fora da main, e mostra as abertas ---
ca2() {
  fresh ca2
  git -C "$repo" checkout -q -b feature/principal-da-vez
  frentes "$repo" novo LUI-1 && [[ $code -eq 0 ]] || return 1
  frentes "$repo" novo LUI-2 && [[ $code -eq 0 ]] || return 1

  # O principal (fora da main) e as duas frentes são as três: a quarta é recusada, com a lista.
  frentes "$repo" novo LUI-3
  [[ $code -ne 0 ]] && contains "limite de 3 frentes" || return 1
  contains "feature/principal-da-vez" && contains "feature/lui-1" && contains "feature/lui-2" || return 1
  [[ ! -e "$work/ca2/principal-lui-3" ]] && ! git -C "$repo" rev-parse --verify -q feature/lui-3 >/dev/null || return 1

  # Com o principal na main, as mesmas duas frentes deixam espaço para a terceira.
  git -C "$repo" checkout -q main
  frentes "$repo" novo LUI-3 && [[ $code -eq 0 ]] || return 1

  # O limite se ajusta: com 1, a segunda frente é recusada.
  fresh ca2-limite
  frentes "$repo" novo LUI-1 && [[ $code -eq 0 ]] || return 1
  out="$(cd "$repo" && FRENTES_LIMITE=1 "$FRENTES" novo LUI-2 2>&1)"
  [[ $? -ne 0 ]] && contains "limite de 1 frentes"
}
check "o novo recusa a quarta frente, contando o principal fora da main, e mostra as abertas @LUI-186-CA2" ca2

# --- CA3: duas criações ao mesmo tempo recebem slots diferentes ---
ca3() {
  local a b
  fresh ca3
  (cd "$repo" && FRENTES_PORT_OWNER="$work/port-owner-slow" "$FRENTES" novo LUI-1 >"$work/ca3-a.out" 2>&1) &
  a=$!
  (cd "$repo" && FRENTES_PORT_OWNER="$work/port-owner-slow" "$FRENTES" novo LUI-2 >"$work/ca3-b.out" 2>&1) &
  b=$!
  wait "$a" && wait "$b" || return 1
  # Slots diferentes: um .env tem o 1 e o outro, o 2, em qualquer ordem.
  { env_has "$work/ca3/principal-lui-1" SLOT=1 && env_has "$work/ca3/principal-lui-2" SLOT=2; } ||
    { env_has "$work/ca3/principal-lui-1" SLOT=2 && env_has "$work/ca3/principal-lui-2" SLOT=1; }
}
check "duas criações ao mesmo tempo recebem slots diferentes @LUI-186-CA3" ca3

# --- CA4: o novo recusa o slot com porta ocupada, dizendo o processo ---
ca4() {
  fresh ca4
  # A web do slot 1 está ocupada por outro processo.
  echo "3010 node (PID 4242)" >"$BUSY_PORTS"
  frentes "$repo" novo LUI-1
  [[ $code -ne 0 ]] && contains "3010" && contains "node (PID 4242)" || return 1
  [[ ! -e "$work/ca4/principal-lui-1" ]] && ! git -C "$repo" rev-parse --verify -q feature/lui-1 >/dev/null || return 1

  # A porta de outro slot ocupada não atrapalha o slot 1.
  echo "3020 node (PID 4243)" >"$BUSY_PORTS"
  frentes "$repo" novo LUI-1
  [[ $code -eq 0 ]] && env_has "$work/ca4/principal-lui-1" SLOT=1
}
check "o novo recusa o slot com porta ocupada, dizendo o processo @LUI-186-CA4" ca4

# --- CA6: o remover recusa o PR não mergeado e a pasta suja, recusa o principal, e remove a mergeada e limpa ---
ca6() {
  local front
  fresh ca6
  front="$work/ca6/principal-lui-1"
  frentes "$repo" novo LUI-1 && [[ $code -eq 0 ]] || return 1
  : >"$DOCKER_LOG"

  # PR aberto: recusa, dizendo o estado, e não mexe em nada.
  pr feature/lui-1 5 ABERTO
  frentes "$repo" remover LUI-1
  [[ $code -ne 0 ]] && contains "#5 aberto" && [[ -d "$front" ]] && ! grep -q "down" "$DOCKER_LOG" || return 1

  # PR mergeado e pasta com arquivo novo fora do .gitignore: recusa, dizendo o arquivo.
  pr feature/lui-1 5 MERGEADO
  echo x >"$front/sobrou.txt"
  frentes "$repo" remover LUI-1
  [[ $code -ne 0 ]] && contains "sobrou.txt" && [[ -d "$front" ]] && ! grep -q "down" "$DOCKER_LOG" || return 1
  rm "$front/sobrou.txt"
  # E com uma mudança num arquivo versionado.
  echo mudou >>"$front/compose.dev.yaml"
  frentes "$repo" remover LUI-1
  [[ $code -ne 0 ]] && contains "compose.dev.yaml" && [[ -d "$front" ]] && ! grep -q "down" "$DOCKER_LOG" &&
    git -C "$repo" rev-parse --verify -q feature/lui-1 >/dev/null || return 1
  git -C "$front" checkout -q -- compose.dev.yaml

  # O checkout principal numa branch de ticket, com o PR mergeado e a pasta limpa: nunca é removido.
  git -C "$repo" checkout -q -b feature/lui-9-com-sufixo
  pr feature/lui-9-com-sufixo 9 MERGEADO
  frentes "$repo" remover LUI-9
  [[ $code -ne 0 ]] && contains "principal" && [[ -d "$repo/.git" ]] || return 1
  git -C "$repo" checkout -q main

  # PR mergeado e pasta limpa (o .env é ignorado): derruba o ambiente com os volumes, tira o worktree e a branch.
  frentes "$repo" remover LUI-1
  [[ $code -eq 0 ]] || return 1
  grep -qxF -- "$front|compose -f compose.dev.yaml down -v" "$DOCKER_LOG" &&
    [[ ! -e "$front" ]] &&
    ! git -C "$repo" worktree list | grep -q lui-1 &&
    ! git -C "$repo" rev-parse --verify -q feature/lui-1 >/dev/null
}
check "o remover recusa o PR não mergeado e a pasta suja, recusa o principal, e remove a frente mergeada e limpa @LUI-186-CA6" ca6

# --- CA7: o remover --forcar remove a frente sem merge (o hook que o nega ao agente é testado no push-verify) ---
ca7() {
  local front
  fresh ca7
  front="$work/ca7/principal-lui-1"
  frentes "$repo" novo LUI-1 && [[ $code -eq 0 ]] || return 1
  : >"$DOCKER_LOG"
  # Com o PR aberto e a pasta suja, a opção remove tudo.
  pr feature/lui-1 5 ABERTO
  echo x >"$front/sobrou.txt"
  frentes "$repo" remover --forcar LUI-1
  [[ $code -eq 0 ]] || return 1
  grep -qxF -- "$front|compose -f compose.dev.yaml down -v" "$DOCKER_LOG" &&
    [[ ! -e "$front" ]] &&
    ! git -C "$repo" rev-parse --verify -q feature/lui-1 >/dev/null
}
check "o remover --forcar remove a frente sem merge @LUI-186-CA7" ca7

# --- CA8: o script recusa o Git abaixo da versão mínima, dizendo qual ela é ---
ca8() {
  local invocation
  fresh ca8
  for invocation in "novo LUI-1" listar "remover LUI-1"; do
    # shellcheck disable=SC2086
    out="$(cd "$repo" && FRENTES_GIT_VERSION=2.30.1 "$FRENTES" $invocation 2>&1)"
    [[ $? -ne 0 ]] && contains "2.38" && contains "2.30.1" && contains "Atualize o Git" || return 1
  done
  # Recusou antes de mexer em qualquer coisa.
  [[ ! -e "$work/ca8/principal-lui-1" ]] || return 1
  # Na versão mínima, segue.
  out="$(cd "$repo" && FRENTES_GIT_VERSION=2.38.0 "$FRENTES" novo LUI-1 2>&1)"
  [[ $? -eq 0 && -d "$work/ca8/principal-lui-1" ]]
}
check "o script recusa o Git abaixo da versão mínima, dizendo qual ela é @LUI-186-CA8" ca8

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

# --- A sonda real de portas (o `ss`), sem a troca do modo de teste: um `ss` de mentira no PATH ---
real_probe() {
  fresh probe
  mkdir -p "$work/probe/bin"
  cat >"$work/probe/bin/ss" <<'STUB'
#!/usr/bin/env bash
# O formato do ss -ltnpH: a porta 3010 tem dono.
[[ "$*" == *":3010 "* ]] && echo 'LISTEN 0 4096 0.0.0.0:3010 0.0.0.0:* users:(("node",pid=4242,fd=19))'
exit 0
STUB
  chmod +x "$work/probe/bin/ss"
  out="$(cd "$repo" && env -u FRENTES_PORT_OWNER PATH="$work/probe/bin:$PATH" "$FRENTES" novo LUI-1 2>&1)"
  [[ $? -ne 0 ]] && contains "3010" && contains "node (PID 4242)" || return 1
  # Sem o `ss` na máquina, o script recusa em vez de aprovar no escuro: um PATH só com o que o script usa.
  rm "$work/probe/bin/ss"
  local tool
  for tool in git jq flock sed awk tr cut head wc paste sort dirname basename cat mkdir tail grep bash env; do
    ln -sf "$(command -v "$tool")" "$work/probe/bin/$tool"
  done
  out="$(cd "$repo" && env -u FRENTES_PORT_OWNER PATH="$work/probe/bin" "$FRENTES" novo LUI-1 2>&1)"
  [[ $? -ne 0 ]] && contains "Falta o \`ss\`"
}
check "a sonda real de portas lê o ss, e sem o ss o script recusa" real_probe

# --- As entradas inválidas são recusadas antes de mexer em qualquer coisa ---
invalid_input() {
  fresh invalid
  # O tipo da branch é um dos quatro da convenção do projeto.
  frentes "$repo" novo LUI-1 feture
  [[ $code -ne 0 ]] && contains "feature, bugfix, hotfix ou docs" && [[ ! -e "$work/invalid/principal-lui-1" ]] || return 1
  # O remover recusa um ticket a mais e uma opção que não conhece, em vez de escolher um deles.
  frentes "$repo" novo LUI-1 && [[ $code -eq 0 ]] || return 1
  frentes "$repo" remover LUI-1 LUI-2
  [[ $code -ne 0 ]] && contains "um ticket só" || return 1
  frentes "$repo" remover LUI-1 --force
  [[ $code -ne 0 ]] && contains "opção" && [[ -d "$work/invalid/principal-lui-1" ]] || return 1
  # Uma branch feita à mão com o ticket em maiúsculas também é a frente do ticket.
  git -C "$repo" worktree add -q -b feature/LUI-5-a-mao "$work/invalid/a-mao" origin/main
  frentes "$repo" novo LUI-5
  [[ $code -ne 0 ]] && contains "já tem frente" || return 1
  # Um checkout principal em HEAD solto é uma frente, e o listar não pergunta ao gh por uma branch vazia.
  git -C "$repo" checkout -q --detach
  frentes "$repo" listar
  [[ $code -eq 0 ]] && contains "(HEAD solto)" && contains "sem PR"
}
check "as entradas inválidas são recusadas, e a branch em maiúsculas e o HEAD solto são tratados" invalid_input

finish "do script de frentes"
