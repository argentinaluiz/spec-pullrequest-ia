# Auxiliares dos testes em shell desta skill: o contador de casos que falharam e a saída `ok:` ou
# `FALHOU:` de cada um. É uma cópia pequena e própria porque uma skill genérica não carrega arquivo do
# projeto. Cada teste a carrega com `source`.
#
# Um caso de uma skill de uso geral não leva o ID de um critério do projeto: a ligação dele com o critério vai
# no mapa de testes do ticket (formatos/mapa-de-testes.md, da skill de plano). Se o projeto roda os testes por um
# executor que define o SH_TEST_LOG e o SH_TEST_SUITE, os casos entram no relatório dele; sem as variáveis, o
# teste só imprime.

failed=0

# Registra um caso no relatório, quando o executor o pediu. Uma linha por caso, separada por TAB.
# record_case <passed|failed> <nome>
record_case() {
  [[ -n "${SH_TEST_LOG:-}" ]] || return 0
  local name="${2//[$'\t\n']/ }"
  printf '%s\t%s\t%s\n' "${SH_TEST_SUITE:-${0##*/}}" "$1" "$name" >>"$SH_TEST_LOG"
}

# pass_case <nome>
pass_case() {
  echo "ok: $1"
  record_case passed "$1"
}

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
# erro, que é o que volta para o agente. Os argumentos do hook vêm de HOOK_ARGS.
# expect_hook <hook> <código esperado> <nome> <entrada> [trecho esperado na saída de erro]
expect_hook() {
  local hook="$1" want="$2" name="$3" input="$4" text="${5:-}" got err
  err="$("$hook" "${HOOK_ARGS[@]}" <<<"$input" 2>&1 >/dev/null)"
  got=$?
  if [[ $got -ne $want || "$err" != *"$text"* ]]; then
    fail_case "$name" "saída $got, esperava $want; erro: $err"
  else
    pass_case "$name"
  fi
}

# finish <o que o teste cobre>
finish() {
  [[ $failed -eq 0 ]] || {
    echo "$failed teste(s) $1 falharam."
    exit 1
  }
}
