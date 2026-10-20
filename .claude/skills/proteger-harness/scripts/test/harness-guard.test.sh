#!/usr/bin/env bash
#
# Testes da Guarda do harness (scripts/harness-guard.sh): o que ela faz com cada tipo da lista que
# recebe, e que roda num diretório de fora, só com essa lista. Rodam na máquina, num diretório
# temporário que faz as vezes da `main`. Os casos levam a tag do critério de aceite no nome.

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
GUARD="$HERE/../harness-guard.sh"
# shellcheck source=helpers.sh
source "$HERE/helpers.sh"

command -v jq >/dev/null || { echo "Falta o \`jq\` na máquina: a Guarda e o teste dela precisam dele."; exit 2; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
main="$tmp/main"
head="$tmp/head"
mkdir -p "$main" "$head"

# A lista com um padrão de cada tipo, e os arquivos que já existem na `main` de mentira.
printf '%s\t%s\n' \
  bloqueado 'ci/**' \
  bloqueado 'Guarda.txt' \
  aviso 'config/*.json' \
  congelado 'tickets/*/*/aceite.md' \
  comandos 'apps/*/package.json' >"$tmp/lista.txt"
for file in tickets/A-1/A-2/aceite.md tickets/A-3/aceite.md tickets/A-1/A-2/fundo/aceite.md apps/api/package.json apps/web/package.json; do
  mkdir -p "$main/$(dirname "$file")"
  echo x >"$main/$file"
done
printf '{"scripts":{"test":"vitest"},"dependencies":{"a":"1"}}\n' >"$main/apps/api/package.json"
printf '{"scripts":{"test":"vitest"},"dependencies":{"a":"1"}}\n' >"$main/apps/web/package.json"
# A versão do pull request: a api trocou o comando de teste, a web só a dependência.
mkdir -p "$head/apps/api" "$head/apps/web"
printf '{"scripts":{"test":"true"},"dependencies":{"a":"1"}}\n' >"$head/apps/api/package.json"
printf '{"scripts":{"test":"vitest"},"dependencies":{"a":"2"}}\n' >"$head/apps/web/package.json"

# guard <lista> <caminhos...>: roda a Guarda na `main` de mentira, com os caminhos alterados, e deixa a
# saída em $out e o código em $code.
guard() {
  local list="$1"
  shift
  out="$(cd "$main" && printf '%s\n' "$@" | HEAD_DIR="$head" "$GUARD" "$list" 2>&1)"
  code=$?
}

contains() { [[ "$out" == *"$1"* ]]; }
lacks() { [[ "$out" != *"$1"* ]]; }
exits() { [[ $code -eq $1 ]]; }

case1="a Guarda reprova o bloqueado, avisa o aviso e o congelado, e bloqueia o manifesto de comandos @LUI-194-CA1"
guard "$tmp/lista.txt" ci/deploy/run.sh
check "$case1: o bloqueado reprova com o código 1 e o nome do arquivo" bash -c '[[ $1 -eq 1 && $2 == *ci/deploy/run.sh* ]]' _ "$code" "$out"
guard "$tmp/lista.txt" config/a.json
check "$case1: o aviso passa e sai como aviso" bash -c '[[ $1 -eq 0 && $2 == *"Arquivo em aviso alterado::config/a.json"* ]]' _ "$code" "$out"
guard "$tmp/lista.txt" tickets/A-1/A-2/aceite.md
check "$case1: avisa o aceite que já existe, na profundidade do padrão" bash -c '[[ $1 -eq 0 && $2 == *"Aceite congelado alterado::tickets/A-1/A-2/aceite.md"* ]]' _ "$code" "$out"
guard "$tmp/lista.txt" tickets/A-3/aceite.md tickets/A-1/A-2/fundo/aceite.md tickets/A-1/A-9/aceite.md
check "$case1: não avisa o aceite de um nível só, o fundo demais nem o novo" lacks "Aceite congelado alterado"
guard "$tmp/lista.txt" apps/api/package.json
check "$case1: o manifesto com os comandos trocados reprova" bash -c '[[ $1 -eq 1 && $2 == *"apps/api/package.json (seção scripts)"* ]]' _ "$code" "$out"
guard "$tmp/lista.txt" apps/web/package.json
check "$case1: o manifesto que só mudou dependências avisa" bash -c '[[ $1 -eq 0 && $2 == *"Arquivo em aviso alterado::apps/web/package.json"* ]]' _ "$code" "$out"
printf '{"scripts":' >"$head/apps/web/package.json"
guard "$tmp/lista.txt" apps/web/package.json
check "$case1: o manifesto que o jq não lê conta como mudança nos comandos" bash -c '[[ $1 -eq 1 ]]' _ "$code"
printf '{"scripts":{"test":"vitest"},"dependencies":{"a":"2"}}\n' >"$head/apps/web/package.json"
guard "$tmp/lista.txt" README.md
check "$case1: o caminho que nenhum padrão casa passa" bash -c '[[ $1 -eq 0 && $2 == APROVADO* ]]' _ "$code" "$out"
guard "$tmp/lista.txt" config/sub/a.json
check "$case1: o * não atravessa a barra, e o caminho fundo passa" exits 0

case2="a Guarda roda num diretório de fora, só com a lista que recebe @LUI-194-CA2"
outside="$tmp/fora"
mkdir -p "$outside"
cp "$GUARD" "$outside/harness-guard.sh"
printf 'bloqueado\tsecreto/**\naviso\tnotas.txt\n' >"$outside/lista.txt"
run_outside() {
  out="$(cd "$outside" && printf '%s\n' "$@" | env -u HEAD_DIR ./harness-guard.sh "${LIST:-lista.txt}" ${DECLARED:+"$DECLARED"} 2>&1)"
  code=$?
}
LIST='' DECLARED='' run_outside secreto/chave
check "$case2: classifica os caminhos pela lista, sem nenhum arquivo do projeto" bash -c '[[ $1 -eq 1 && $2 == *secreto/chave* ]]' _ "$code" "$out"
run_outside notas.txt
check "$case2: o aviso da lista de fora sai como aviso" bash -c '[[ $1 -eq 0 && $2 == *"notas.txt"* ]]' _ "$code" "$out"
LIST="$outside/nao-existe.txt" run_outside notas.txt
check "$case2: sem lista, sai com o código 2 e diz por quê" bash -c '[[ $1 -eq 2 && $2 == *"lista de arquivos protegidos"* ]]' _ "$code" "$out"
out="$(cd "$outside" && echo notas.txt | ./harness-guard.sh 2>&1)"
code=$?
check "$case2: sem o argumento da lista, sai com o código 2" exits 2
printf 'bloqueado\tx/**\n' >"$outside/ilegivel.txt"
chmod 000 "$outside/ilegivel.txt"
LIST=ilegivel.txt run_outside x/a
chmod 600 "$outside/ilegivel.txt"
check "$case2: a lista ilegível sai com o código 2 @LUI-194-CA2" bash -c '[[ $1 -eq 2 && $2 == *"não se lê"* ]]' _ "$code" "$out"
printf 'segredo\tx/**\n' >"$outside/ruim.txt"
LIST=ruim.txt run_outside x/a
check "$case2: tipo desconhecido sai com o código 2 e nomeia o tipo" bash -c '[[ $1 -eq 2 && $2 == *segredo* ]]' _ "$code" "$out"
printf 'bloqueado sem tabulacao\n' >"$outside/ruim2.txt"
LIST=ruim2.txt run_outside x/a
check "$case2: linha sem tabulação sai com o código 2" exits 2
out="$(cd "$outside" && ./harness-guard.sh lista.txt </dev/null 2>&1)"
code=$?
check "$case2: a lista de caminhos vazia sai com o código 2" bash -c '[[ $1 -eq 2 && $2 == *vazia* ]]' _ "$code" "$out"
LIST='' DECLARED=3000 run_outside notas.txt
check "$case2: mais arquivos que o limite da API sai com o código 2" bash -c '[[ $1 -eq 2 && $2 == *3000* ]]' _ "$code" "$out"
LIST='' DECLARED=abc run_outside notas.txt
check "$case2: o total que não é um número sai com o código 2 @LUI-194-CA2" bash -c '[[ $1 -eq 2 && $2 == *"não é um número"* ]]' _ "$code" "$out"
LIST='' DECLARED=2999 run_outside notas.txt
check "$case2: o limite da API é só o teto, abaixo dele passa" exits 0

finish "da Guarda do harness"
