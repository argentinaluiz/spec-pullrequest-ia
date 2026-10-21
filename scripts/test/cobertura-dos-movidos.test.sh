#!/usr/bin/env bash
#
# Teste da cobertura dos critérios congelados que as suítes em shell provavam antes de mudarem de lugar: a busca
# dos testes (verify/skill-tests.sh), com a pasta de scripts do projeto, acha cada suíte que mudou de lugar, sem lista
# à mão, e cada critério que ela provava continua com o ID na tag de um caso de uma suíte achada. O
# executor das suítes (shell-tests.sh) transforma o token do nome do caso em tag do relatório, que o
# conferidor do aceite lê, e é por isso que o ID no nome basta. Roda na máquina, como o executor, porque ele
# usa o `jq`. O caso leva a tag do critério de aceite no nome.

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
# shellcheck source=../../.claude/skills/__tests__/helpers.sh
source "$HERE/../../.claude/skills/__tests__/helpers.sh"

command -v jq >/dev/null || { echo "Falta o \`jq\` na máquina: o executor dos testes em shell precisa dele."; exit 2; }

name="os critérios congelados provados pelos testes que mudaram de lugar continuam com o ID na tag @LUI-195-CA3"

cd "$ROOT" || exit 2
mapfile -t suites < <(scripts/verify/skill-tests.sh sh .claude/skills scripts)

# As suítes que mudaram de lugar, e que a busca tem de achar sem lista à mão.
for moved in api-migration-order full-lock full-semaphore git-mount shell-tests skill-tests \
  push-verify stop-verify record-touched settings-hooks; do
  found=no
  for suite in "${suites[@]}"; do
    [[ "$suite" == scripts/test/"$moved".test.sh ]] && found=yes
  done
  check "$name: a busca acha a suíte $moved em scripts/test" test "$found" = yes
done

# Os critérios congelados que essas suítes provavam, cada um com o ID na tag de um caso de alguma suíte
# achada: LUI-183 (o relatório dos testes em shell), LUI-185 (o semáforo e a ordem das migrações) e LUI-194 (a busca
# dos testes das skills). A negação do abandono de frentes (LUI-186-CA7) saiu do hook de antes do push para o hook da
# skill worktree e, como o teste dela é de uma skill de uso geral, é ligada pelo mapa de testes do ticket.
for id in LUI-183-CA1 LUI-183-CA2 LUI-183-CA3 LUI-185-CA1 LUI-185-CA2 LUI-185-CA3 LUI-194-CA5; do
  check "$name: o $id continua com a tag em uma suíte achada" grep -qF -- "@$id" "${suites[@]}"
done

# O executor liga o token do nome do caso à tag do relatório, como antes da mudança.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cat >"$tmp/suite.test.sh" <<SUITE
#!/usr/bin/env bash
source "$HERE/../../.claude/skills/__tests__/helpers.sh"
pass_case "um caso de aceite @PROJ-1-CA1 e outro @PROJ-1-CA2"
finish "da suíte"
SUITE
scripts/test/shell-tests.sh "$tmp/relatorio.json" "$tmp/suite.test.sh" >/dev/null 2>&1
tags="$(jq -r '[.testResults[].assertionResults[].tags[]] | sort | join(" ")' "$tmp/relatorio.json" 2>/dev/null)"
check "$name: o executor põe o token do nome do caso na tag do relatório" test "$tags" = "@PROJ-1-CA1 @PROJ-1-CA2"

finish "da cobertura dos critérios que mudaram de lugar"
