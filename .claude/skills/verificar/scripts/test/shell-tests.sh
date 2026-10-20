#!/usr/bin/env bash
#
# Executor das suítes em shell do harness: roda cada suíte e grava o relatório no formato do Vitest,
# o mesmo que o relatório dos testes em Node, para o `check-report.cjs` e o conferidor do aceite (o
# .claude/skills/plan-ticket/scripts/check-acceptance.cjs) o lerem. O token `@<ticket>-CA<n>` do nome de um caso vira também uma
# tag dele, como no repórter dos testes em Node (node-test-report.cjs). Como nomear um
# caso de aceite está no cabeçalho do sh-helpers.sh.
#
#   shell-tests.sh <relatório> <suíte>...
#
# Apaga o relatório antes de rodar e sempre grava um novo no fim, até com uma suíte que falha: um
# relatório de uma execução anterior nunca cobre um critério cujo caso não rodou agora. Segue depois
# de uma suíte que falha, para o relatório trazer todas. Uma suíte que sai com erro sem ter registrado
# um caso que falhou (ou que não existe) vira um caso que falhou, com o código dela, para o erro dela
# não passar por um relatório sem falha.
#
# Sai com 0 se todas as suítes passaram, 1 se alguma falhou e 2 no uso errado. Roda na máquina, como
# as suítes, e precisa do `jq`.

set -uo pipefail

if [[ $# -lt 2 ]]; then
  echo 'Uso: .claude/skills/verificar/scripts/test/shell-tests.sh <relatório> <suíte>...' >&2
  exit 2
fi
command -v jq >/dev/null || {
  echo 'Falta o `jq` na máquina: o executor dos testes em shell precisa dele.' >&2
  exit 2
}

report="$1"
shift
suites=("$@")

log="$(mktemp)" || exit 2
trap 'rm -f "$log"' EXIT
rm -f "$report"
mkdir -p "$(dirname "$report")" || exit 2

# Se a suíte registrou algum caso que falhou.
# has_failed_case <suíte>
has_failed_case() {
  awk -F'\t' -v suite="$1" '$1 == suite && $2 == "failed" { found = 1 } END { exit !found }' "$log"
}

status=0
export SH_TEST_LOG="$log"
for suite in "${suites[@]}"; do
  export SH_TEST_SUITE="$suite"
  if [[ -f "$suite" ]]; then
    bash "$suite"
    code=$?
  else
    echo "A suíte $suite não existe."
    code=127
  fi
  if [[ $code -ne 0 ]]; then
    status=1
    # O erro de uma suíte sem um caso que o explique vira um caso que falhou.
    has_failed_case "$suite" ||
      printf '%s\tfailed\t%s\n' "$suite" "a suíte terminou com erro (saída $code) sem registrar um caso que falhou" >>"$log"
  fi
done
unset SH_TEST_LOG SH_TEST_SUITE

# O relatório: um arquivo por suíte, os casos na ordem em que rodaram. O `-R` lê o log linha a linha,
# e o `scan` tira o token do ID do nome (sem grupos, ele devolve o texto inteiro do que casou). A
# expressão do token é a do TOKEN de node-test-report.cjs: mude as duas juntas.
jq -R -n --args '
  [inputs | split("\t") | {suite: .[0], status: .[1], title: .[2]}] as $cases
  | [$ARGS.positional[] as $suite
      | {name: $suite,
         assertionResults: [$cases[] | select(.suite == $suite) | {
           title: .title,
           fullName: .title,
           ancestorTitles: [],
           tags: [.title | scan("@[A-Z][A-Z0-9]*-[0-9]+-CA[0-9]+")],
           status: .status
         }]}] as $files
  | [$files[].assertionResults[]] as $all
  | {
      numTotalTests: ($all | length),
      numFailedTests: ($all | map(select(.status == "failed")) | length),
      numPendingTests: 0,
      numTodoTests: 0,
      testResults: $files
    }' "${suites[@]}" <"$log" >"$report" || {
  echo "Não deu para gravar o relatório $report." >&2
  rm -f "$report"
  exit 2
}

exit $status
