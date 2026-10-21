# Auxiliares dos testes em shell: o contador de casos que falharam e a saída `ok:` ou `FALHOU:` de cada um. São os
# únicos: os testes das skills e os do projeto os carregam desta pasta com `source`.
#
# O relatório: quando o executor dos testes em shell do projeto define o SH_TEST_LOG, cada caso entra nele, uma linha
# por caso, `<suíte>`, `<passed|failed>` e `<nome>`, separados por TAB, com a suíte do SH_TEST_SUITE (ou o nome do
# script, se a suíte roda sozinha); sem a variável, o teste só imprime. O executor transforma esse log no relatório
# que o conferidor do aceite (scripts/check-acceptance.cjs) lê, e um caso que não rodou agora não cobre critério nenhum.
#
# Um caso prova um critério de aceite de um de dois jeitos. O teste do projeto põe o token `@<ticket>-CA<n>` no nome
# do caso, e o executor o repete nas tags. O teste de uma skill não leva ID de projeto nenhum, porque vai com a skill
# para outros projetos: a ligação dele com o critério fica no mapa de testes do ticket (formatos/mapa-de-testes.md).
# Uma suíte com asserção própria dá o veredito pelo `pass_case` e pelo `fail_case`, que imprimem, registram e contam
# o caso.

failed=0

# Registra um caso no relatório, quando o executor o pediu (SH_TEST_LOG). O TAB e a quebra de linha do nome viram
# espaço.
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

# Um caso de hook: roda o hook com a entrada dada e confere o código de saída e um trecho da saída de erro, que é o
# que volta para o agente. Os argumentos do hook, quando ele os tem, vêm do array HOOK_ARGS.
# expect_hook <hook> <código esperado> <nome> <entrada> [trecho esperado na saída de erro]
expect_hook() {
  local hook="$1" want="$2" name="$3" input="$4" text="${5:-}" got err
  err="$("$hook" ${HOOK_ARGS[@]+"${HOOK_ARGS[@]}"} <<<"$input" 2>&1 >/dev/null)"
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
