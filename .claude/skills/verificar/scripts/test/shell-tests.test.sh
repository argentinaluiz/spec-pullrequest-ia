#!/usr/bin/env bash
#
# Testes do executor das suítes em shell (shell-tests.sh) e do relatório dele: o caso com o
# token de um ID no nome sai com a tag, o conferidor do aceite o conta, e o relatório é refeito a cada
# execução. Cada teste monta suítes de mentira (scripts que carregam o sh-helpers.sh e rodam um caso com
# o ID de mentira `PROJ-9`), roda o executor e confere o relatório com o conferidor de verdade, o mesmo
# do modo completo, pelo .claude/skills/ambiente/scripts/node-in-api.sh. O conferidor roda no contêiner `api`, que monta o
# repositório em /repo, então a pasta de trabalho fica em apps/api/reports/ (ignorada pelo Git), e o
# conferidor lê dali o aceite de mentira e o relatório. Rodam na máquina, como o executor, que precisa
# do `jq`. Quem chama é o verify.sh.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../../../.." && pwd)"
# shellcheck source=sh-helpers.sh
source "$ROOT/.claude/skills/verificar/scripts/test/sh-helpers.sh"

command -v jq >/dev/null || { echo "Falta o \`jq\` na máquina: o executor e o teste dele precisam dele."; exit 2; }

RUNNER="$ROOT/.claude/skills/verificar/scripts/test/shell-tests.sh"
mkdir -p "$ROOT/apps/api/reports"
work="$(mktemp -d -p "$ROOT/apps/api/reports" shell-tests.XXXXXX)"
trap 'rm -rf "$work"' EXIT
# O mktemp cria a pasta só para o dono, e o conferidor lê dela no contêiner, com outro usuário se a máquina
# tem outro (o runner da CI).
chmod 755 "$work"
# A pasta de trabalho como o contêiner a vê, e relativa à raiz dele, que é onde o conferidor lê os tickets.
in_container="/repo/${work#"$ROOT"/}"
tickets="${work#"$ROOT"/}/tickets"
report="$work/shell-tests.json"

# O arquivo de aceite de mentira: um critério de teste de unidade, PROJ-9-CA1.
mkdir -p "$work/tickets/PROJ-8/PROJ-9"
cat >"$work/tickets/PROJ-8/PROJ-9/aceite.md" <<'ACCEPTANCE'
# Aceite do PROJ-9

## PROJ-9-CA1

**Marca:** teste de unidade

**Cenário:** Dado um caso de mentira, quando ele roda, então o critério está coberto.
ACCEPTANCE

# suite <arquivo> <corpo>: uma suíte de mentira, que carrega os auxiliares reais.
suite() {
  {
    printf '#!/usr/bin/env bash\nsource "%s/.claude/skills/verificar/scripts/test/sh-helpers.sh"\n' "$ROOT"
    printf '%s\n' "$2"
  } >"$work/$1"
}

suite passes.sh 'check "o caso passa @PROJ-9-CA1" true
finish "da suíte de mentira"'
suite fails.sh 'check "o caso falha @PROJ-9-CA1" false
finish "da suíte de mentira"'
suite without-case.sh 'check "um caso sem o ID" true
finish "da suíte de mentira"'
# Termina com erro sem ter registrado um caso que falhou.
suite crashes.sh 'exit 3'

# run <suíte...>: roda o executor sobre as suítes dadas, no relatório de mentira, e deixa o código em $code.
run() {
  local suites=() name
  for name in "$@"; do suites+=("$work/$name"); done
  "$RUNNER" "$report" "${suites[@]}" >/dev/null 2>&1
  code=$?
}

# checker: o conferidor do aceite sobre o relatório de mentira, lido como `vitest`, com a saída em $out e
# o código em $checker_code.
checker() {
  out="$(.claude/skills/ambiente/scripts/node-in-api.sh .claude/skills/plan-ticket/scripts/check-acceptance.cjs --optional - "$tickets" "vitest:$in_container/shell-tests.json" 2>&1 </dev/null)"
  checker_code=$?
}

# O relatório de mentira satisfaz o filtro do jq.
report_has() {
  jq -e "$1" "$report" >/dev/null
}

cd "$ROOT" || exit 2

# --- CA1: o caso com o ID no nome sai com a tag, e o conferidor o conta ---
ca1() {
  run passes.sh &&
    [[ $code -eq 0 ]] &&
    report_has '.testResults[0].assertionResults[0]
      | .title == "o caso passa @PROJ-9-CA1" and .tags == ["@PROJ-9-CA1"] and .status == "passed"' &&
    report_has '.numTotalTests == 1 and .numFailedTests == 0' &&
    checker &&
    [[ $checker_code -eq 0 && "$out" == *"PROJ-9-CA1: coberto por 1 teste(s)."* ]]
}
check "o caso com o ID no nome sai no relatório com a tag e o conferidor o conta como coberto @LUI-183-CA1" ca1

# --- CA2: o caso que falha reprova o critério ---
ca2_failed() {
  run fails.sh &&
    [[ $code -eq 1 ]] &&
    report_has '.testResults[0].assertionResults[0] | .tags == ["@PROJ-9-CA1"] and .status == "failed"' &&
    checker &&
    [[ $checker_code -eq 1 && "$out" == *"PROJ-9-CA1: um teste com o ID dele falhou."* ]]
}
check "o caso que falha sai como failed e o conferidor reprova o critério @LUI-183-CA2" ca2_failed

ca2_crash() {
  run crashes.sh &&
    [[ $code -eq 1 ]] &&
    report_has '.numTotalTests == 1 and .numFailedTests == 1
      and (.testResults[0].assertionResults[0] | .status == "failed" and (.title | contains("terminou com erro (saída 3)")))'
}
check "a suíte que termina com erro sem caso que falhou vira um caso que falhou @LUI-183-CA2" ca2_crash

# --- CA3: o relatório de uma execução anterior não cobre o critério ---
ca3() {
  # Antes, o relatório traz a tag: sem isso, o teste não provaria que foi a execução nova que a tirou.
  run passes.sh && report_has '.testResults[0].assertionResults[0].tags == ["@PROJ-9-CA1"]' &&
    run without-case.sh &&
    [[ $code -eq 0 ]] &&
    report_has '[.testResults[].assertionResults[].tags[]] == []' &&
    checker &&
    [[ $checker_code -eq 1 && "$out" == *"PROJ-9-CA1"*"não tem nenhum teste"* ]]
}
check "o relatório de uma execução anterior não cobre o critério cujo caso não rodou agora @LUI-183-CA3" ca3

# --- O que o executor garante além dos critérios ---
missing_suite() {
  run passes.sh nao-existe.sh &&
    [[ $code -eq 1 ]] &&
    report_has '.numFailedTests == 1 and (.testResults[1].assertionResults[0].title | contains("saída 127"))'
}
check "a suíte que não existe vira um caso que falhou, e as outras entram no relatório" missing_suite

after_failure() {
  run fails.sh passes.sh &&
    [[ $code -eq 1 ]] &&
    report_has '.testResults | length == 2 and (.[1].assertionResults[0].status == "passed")'
}
check "o executor segue depois da suíte que falha e o relatório traz todas" after_failure

check "sem suíte, o executor recusa com a saída 2" bash -c '"$0" "$1" 2>/dev/null; [[ $? -eq 2 ]]' "$RUNNER" "$report"

# Sem o executor (sem SH_TEST_LOG), os auxiliares só imprimem, como sempre.
no_executor() {
  (unset SH_TEST_LOG SH_TEST_SUITE && bash "$work/passes.sh" | grep -q '^ok: o caso passa')
}
check "sem o executor, os auxiliares só imprimem" no_executor

finish "do executor dos testes em shell"
