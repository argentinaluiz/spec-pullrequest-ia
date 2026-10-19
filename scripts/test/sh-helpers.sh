# Auxiliares das suítes em shell do harness (a dos hooks, a da trava do modo completo e as dos modos do
# verify.sh): o contador de casos que falharam e a saída `ok:` ou `FALHOU:` de cada um. Cada suíte os
# carrega com `source`.
#
# Um caso de shell também pode provar um critério de aceite, como um teste em Node. Para isso, ponha o
# token do ID no nome do caso, como `@<ticket>-CA<n>` (por exemplo, `@LUI-183-CA1`), e o critério tem de
# ser de teste no arquivo de aceite. O nome fica como foi escrito, e o executor
# (scripts/test/shell-tests.sh) repete o token em `tags` no relatório, que o conferidor do aceite lê.
#
# O relatório fica em apps/api/reports/harness/shell-tests.json, no mesmo formato do Vitest que o
# relatório dos testes em Node (node-tests.json, ao lado). O executor o apaga e o grava de novo a cada
# execução, então um caso que não rodou agora não cobre critério nenhum. Quem grava os casos nele são
# estes auxiliares, pelo `record_case`, no arquivo que o executor aponta em SH_TEST_LOG; sem a variável,
# eles só imprimem, como sempre. Uma suíte com asserção própria dá o veredito pelo `pass_case` e pelo
# `fail_case`, que imprimem, registram e contam o caso.

failed=0

# Registra um caso no relatório dos testes em shell, quando o executor o pediu (SH_TEST_LOG). A suíte é
# a que o executor está rodando (SH_TEST_SUITE), ou o nome do script, se a suíte roda sozinha.
# O log tem um caso por linha, separado por TAB: o TAB e a quebra de linha do nome viram espaço.
# record_case <passed|failed> <nome>
record_case() {
  [[ -n "${SH_TEST_LOG:-}" ]] || return 0
  local name="${2//[$'\t\n']/ }"
  printf '%s\t%s\t%s\n' "${SH_TEST_SUITE:-${0##*/}}" "$1" "$name" >>"$SH_TEST_LOG"
}

# O veredito de um caso: imprime, registra no relatório e, se falhou, conta.
# pass_case <nome>
pass_case() {
  echo "ok: $1"
  record_case passed "$1"
}

# O detalhe só sai na tela: o relatório traz o nome, que é por onde o conferidor liga o caso ao critério.
# fail_case <nome> [detalhe]
fail_case() {
  echo "FALHOU: $1${2:+ ($2)}"
  record_case failed "$1"
  failed=$((failed + 1))
}

# Um caso que passa quando a condição sai com 0.
# check <nome> <condição...>
check() {
  local name="$1"
  shift
  if "$@"; then pass_case "$name"; else fail_case "$name"; fi
}

# Um caso de hook: roda o hook com a entrada dada e confere o código de saída e um trecho da saída de
# erro, que é o que volta para o agente.
# expect_hook <hook> <código esperado> <nome> <entrada> [trecho esperado na saída de erro]
expect_hook() {
  local hook="$1" want="$2" name="$3" input="$4" text="${5:-}" got err
  err="$("$hook" <<<"$input" 2>&1 >/dev/null)"
  got=$?
  if [[ $got -ne $want || "$err" != *"$text"* ]]; then
    fail_case "$name" "saída $got, esperava $want; erro: $err"
  else
    pass_case "$name"
  fi
}

# O fim da suíte: sai com 1, dizendo quantos casos falharam, se algum falhou.
# finish <o que a suíte testa>
finish() {
  [[ $failed -eq 0 ]] || {
    echo "$failed teste(s) $1 falharam."
    exit 1
  }
}
