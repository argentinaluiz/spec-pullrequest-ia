#!/usr/bin/env bash
#
# Testes do script dos insumos da revisão de conformidade (scripts/review-inputs.sh): os argumentos, o diff da branch com os
# arquivos novos sem mexer no índice, a base pelo ponto em que a branch saiu dela, o commit de plano exigido e a mensagem
# dele, o desvio do contrato gravado sempre e a mudança sem ticket, que exige os critérios. O script roda copiado num
# repositório temporário, que só tem a skill: a base e o comando do desvio chegam por opção, e o comando do desvio é um
# falso (a comparação real tem os próprios testes). Não carrega arquivo de projeto: o auxiliar é o da própria skill. Roda na
# máquina. Os casos de aceite se ligam aos critérios pelo mapa de testes do ticket, e não pelo nome.

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=helpers.sh
source "$HERE/helpers.sh"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
repo="$tmp/repo"

not() {
  ! "$@"
}

contains() {
  [[ "$1" == *"$2"* ]]
}

# O repositório: só a cópia do script da skill e as regras de .gitignore da pasta dos tickets, na main.
SK=.claude/skills/revisao-conformidade
mkdir -p "$repo/$SK/scripts" "$repo/apps/api" "$repo/docs/tickets/PROJ-1/PROJ-3"
cp "$HERE/../review-inputs.sh" "$repo/$SK/scripts/"
printf '%s\n' 'docs/tickets/*/*/*' '!docs/tickets/*/*/aceite.md' '!docs/tickets/*/*/mapa-de-testes.txt' >"$repo/.gitignore"
# O comando do desvio do contrato, falso, chamado como o do contrato da raiz: <commit de plano> <para, ou vazio> <arquivo do desvio>.
# Com FAKE_DRIFT, há desvio, e ele faz como o de verdade (acrescenta a visão ao arquivo e avisa); sem ela, diz que o contrato está
# igual, sem gravar nada; com FAKE_DRIFT_FAIL, não consegue conferir.
cat >"$tmp/desvio" <<'EOF'
#!/usr/bin/env bash
if [[ -n "${FAKE_DRIFT_FAIL:-}" ]]; then
  echo "o oasdiff não rodou"
  exit 1
elif [[ -n "${FAKE_DRIFT:-}" ]]; then
  printf '%s\n' "$FAKE_DRIFT" | tee -a "$3"
  echo "::warning title=Contrato diferente do planejado::aviso"
else
  echo "O contrato e o schema estão iguais ao planejado no commit de plano $(git rev-parse --short "$1")."
fi
EOF
chmod +x "$tmp/desvio"
git -C "$repo" init -q -b main
git -C "$repo" config user.email teste@exemplo.com
git -C "$repo" config user.name Teste
printf 'export const a = 1;\n' >"$repo/apps/api/existente.ts"
printf 'export const velho = 1;\n' >"$repo/apps/api/apagado.ts"
# Um aceite que já estava na main: nenhum commit da branch o criou.
printf '# Aceite do PROJ-3\n' >"$repo/docs/tickets/PROJ-1/PROJ-3/aceite.md"
git -C "$repo" add -A && git -C "$repo" commit -q -m base

# A branch: o commit de plano do PROJ-2, uma mudança num arquivo versionado e um arquivo novo.
git -C "$repo" switch -q -c trabalho
mkdir -p "$repo/docs/tickets/PROJ-1/PROJ-2"
printf '# Aceite do PROJ-2\n' >"$repo/docs/tickets/PROJ-1/PROJ-2/aceite.md"
git -C "$repo" add -A && git -C "$repo" commit -q -m 'plano do PROJ-2' -m 'Decisão: a cota vale por usuário.'

# A main anda depois que a branch saiu dela: a mudança dela não é da branch.
git -C "$repo" switch -q main
printf 'export const alheio = 1;\n' >"$repo/apps/api/alheio.ts"
git -C "$repo" add -A && git -C "$repo" commit -q -m 'mudança de outra branch'
git -C "$repo" switch -q trabalho

# Um commit comum depois do plano, com um arquivo novo: o commit de plano deixa de ser o HEAD.
printf 'export const feito = true;\n' >"$repo/apps/api/commitado.ts"
git -C "$repo" add -A && git -C "$repo" commit -q -m 'implementa o PROJ-2'

printf 'export const a = 2;\n' >"$repo/apps/api/existente.ts"
printf 'export const novo = true;\n' >"$repo/apps/api/novo.ts"
printf 'export const espaco = true;\n' >"$repo/apps/api/com espaço.ts"
rm "$repo/apps/api/apagado.ts"

# review <argumentos...>: roda o script no repositório temporário, contra a main dele, com o comando do desvio falso, e deixa a
# saída em $out, a saída de erro em $err e o código em $code.
review() {
  local errfile="$tmp/err" opts=(--base main --desvio "$tmp/desvio")
  out="$(cd "$repo" && $SK/scripts/review-inputs.sh "${opts[@]}" "$@" 2>"$errfile")"
  code=$?
  err="$(<"$errfile")"
}

# --- argumentos

review PROJ-1
check "recusa um argumento só, com código 2" test $code -eq 2
check "a mensagem mostra as duas formas do comando" contains "$err" "sem-ticket <nome>"

review pai PROJ-2
check "recusa um <pai> que não tem a forma PREFIXO-N" test $code -eq 2

review PROJ-1 ticket
check "recusa um <ticket> que não tem a forma PREFIXO-N" test $code -eq 2
check "a mensagem do <ticket> inválido mostra as duas formas do comando" contains "$err" "sem-ticket <nome>"

review PROJ-1 PROJ-2 extra
check "recusa três argumentos" test $code -eq 2
check "a mensagem de três argumentos mostra as duas formas do comando" contains "$err" "sem-ticket <nome>"

review sem-ticket 'Nome Ruim'
check "recusa um nome sem ticket com maiúscula e espaço" test $code -eq 2

review sem-ticket ../fora
check "recusa um nome sem ticket que sai da pasta" test $code -eq 2

# --- ticket sem plano

review PROJ-1 PROJ-9
check "recusa um ticket sem arquivo de aceite" test $code -eq 2
check "diz que o arquivo de aceite não existe" contains "$err" "não existe"

review PROJ-1 PROJ-3
check "recusa um ticket cujo aceite nenhum commit da branch criou" test $code -eq 2
check "diz que falta o commit de plano" contains "$err" "não tem commit de plano"

# --- ticket planejado

dir="$repo/docs/tickets/PROJ-1/PROJ-2"
plan="$(git -C "$repo" log --format=%H -1 --diff-filter=A -- docs/tickets/PROJ-1/PROJ-2/aceite.md)"
index_before="$(git -C "$repo" ls-files --stage | sha256sum)"
review PROJ-1 PROJ-2
check "com o commit de plano, passa" test $code -eq 0
diff_text="$(cat "$dir/review.diff" 2>/dev/null)"
check "o diff traz o arquivo novo" contains "$diff_text" "b/apps/api/novo.ts"
check "o diff traz a mudança no arquivo versionado" contains "$diff_text" "+export const a = 2;"
check "o diff traz o aceite criado pelo commit de plano" contains "$diff_text" "b/docs/tickets/PROJ-1/PROJ-2/aceite.md"
check "o diff não traz a mudança que a main ganhou depois" not contains "$diff_text" "alheio"
check "o diff traz o arquivo novo já em commit" contains "$diff_text" "b/apps/api/commitado.ts"
check "o diff traz o arquivo apagado" contains "$diff_text" "deleted file mode"
check "o diff traz o arquivo novo com espaço no nome" contains "$diff_text" "b/apps/api/com espaço.ts"
check "o índice de quem trabalha fica igual" test "$(git -C "$repo" ls-files --stage | sha256sum)" = "$index_before"
check "o arquivo novo continua fora do índice" not git -C "$repo" ls-files --error-unmatch --quiet apps/api/novo.ts 2>/dev/null
check "a mensagem do plano é a do commit de plano, e não a do HEAD" test "$(cat "$dir/plano.txt" 2>/dev/null)" = "$(git -C "$repo" log -1 --format=%B "$plan")"
check "sem desvio, o arquivo do desvio diz que o contrato está igual" contains "$(cat "$dir/contract-drift.txt" 2>/dev/null)" "iguais ao planejado"
check "o desvio é comparado com o commit de plano" contains "$(cat "$dir/contract-drift.txt" 2>/dev/null)" "$(git -C "$repo" rev-parse --short "$plan")"
check "a saída lista o arquivo novo fora do Git" contains "$out" "- apps/api/novo.ts"
check "a saída lista o arquivo novo já em commit" contains "$out" "- apps/api/commitado.ts"
check "a saída lista o arquivo novo com espaço no nome" contains "$out" "- apps/api/com espaço.ts"
check "a saída traz o caminho da mensagem do plano" contains "$out" "docs/tickets/PROJ-1/PROJ-2/plano.txt"
check "os insumos ficam fora do git status" not contains "$(git -C "$repo" status --porcelain)" "review.diff"

FAKE_DRIFT="visão do desvio" review PROJ-1 PROJ-2
drift_text="$(cat "$dir/contract-drift.txt" 2>/dev/null)"
check "com desvio, passa" test $code -eq 0
check "com desvio, o arquivo traz a visão" contains "$drift_text" "visão do desvio"
check "com desvio, o arquivo não traz o aviso da CI" not contains "$drift_text" "::warning"

FAKE_DRIFT_FAIL=1 review PROJ-1 PROJ-2
check "com o desvio que falha, a revisão continua" test $code -eq 0
check "com o desvio que falha, o arquivo diz que ele não foi conferido" contains "$(cat "$dir/contract-drift.txt" 2>/dev/null)" "não pôde ser conferido"

review PROJ-1 PROJ-2
check "uma revisão sem desvio não deixa a visão da anterior" not contains "$(cat "$dir/contract-drift.txt" 2>/dev/null)" "visão do desvio"

# --- insumos que iriam para um commit

cp "$repo/.gitignore" "$tmp/gitignore"
: >"$repo/.gitignore"
rm -f "$dir/review.diff"
review PROJ-1 PROJ-2
check "sem a regra do .gitignore, recusa a revisão" test $code -eq 2
check "sem a regra do .gitignore, diz que o insumo iria para um commit" contains "$err" "iria para um commit"
check "sem a regra do .gitignore, não grava o diff" test ! -e "$dir/review.diff"
cp "$tmp/gitignore" "$repo/.gitignore"

# --- sem ticket

review sem-ticket skill-de-revisao
check "sem ticket, recusa a revisão sem os critérios" test $code -eq 2
check "sem ticket, diz que falta o criterios.md" contains "$err" "criterios.md"

mkdir -p "$repo/docs/tickets/sem-ticket/skill-de-revisao"
printf '1. Um critério.\n' >"$repo/docs/tickets/sem-ticket/skill-de-revisao/criterios.md"
review sem-ticket skill-de-revisao
check "sem ticket, com os critérios, passa" test $code -eq 0
check "sem ticket, grava o diff" test -s "$repo/docs/tickets/sem-ticket/skill-de-revisao/review.diff"
check "sem ticket, não grava mensagem de plano" test ! -e "$repo/docs/tickets/sem-ticket/skill-de-revisao/plano.txt"
check "sem ticket, a saída traz o caminho dos critérios" contains "$out" "sem-ticket/skill-de-revisao/criterios.md"
check "sem ticket, a saída avisa que não há plano nem desvio" contains "$out" "sem commit de plano"

# --- os casos que o aceite liga aos critérios, pelo nome: cada um confere o resultado inteiro de uma rodada

review PROJ-1 PROJ-2
dir="$repo/docs/tickets/PROJ-1/PROJ-2"
summary_ok() {
  [[ $code -eq 0 ]] &&
    [[ "$(cat "$dir/review.diff")" == *"b/apps/api/novo.ts"* && "$(cat "$dir/review.diff")" == *"b/apps/api/com espaço.ts"* ]] &&
    [[ "$(cat "$dir/review.diff")" == *"b/apps/api/commitado.ts"* && "$(cat "$dir/review.diff")" != *alheio* ]] &&
    [[ "$(cat "$dir/review.diff")" == *"+export const a = 2;"* && "$(cat "$dir/review.diff")" == *"deleted file mode"* ]] &&
    [[ "$out" == *"- apps/api/commitado.ts"* && "$out" == *"- apps/api/com espaço.ts"* ]] &&
    [[ "$(cat "$dir/plano.txt")" == "$(git -C "$repo" log -1 --format=%B "$plan")" ]] &&
    [[ "$(cat "$dir/contract-drift.txt")" == *"iguais ao planejado"* ]] &&
    [[ "$out" == *"- apps/api/novo.ts"* && "$out" == *"plano.txt"* ]]
}
check "grava o diff desde a base com os arquivos novos, a mensagem do commit de plano e o desvio" summary_ok

review PROJ-1 PROJ-3
refuses_without_plan() { [[ $code -eq 2 && "$err" == *"não tem commit de plano"* ]]; }
check "recusa um ticket sem commit de plano" refuses_without_plan

rm -f "$repo/docs/tickets/sem-ticket/skill-de-revisao/criterios.md"
review sem-ticket skill-de-revisao
refuses_without_criteria() { [[ $code -eq 2 && "$err" == *"criterios.md"* ]]; }
check "recusa uma mudança sem ticket sem critérios" refuses_without_criteria

cp "$repo/.gitignore" "$tmp/gitignore"
: >"$repo/.gitignore"
rm -f "$dir/review.diff"
review PROJ-1 PROJ-2
refuses_unignored() { [[ $code -eq 2 && "$err" == *"iria para um commit"* && ! -e "$dir/review.diff" ]]; }
check "recusa um insumo que o Git não ignoraria" refuses_unignored
cp "$tmp/gitignore" "$repo/.gitignore"

# Sem ticket, o script só grava o diff e lê os critérios: o .gitignore mínimo (só esses dois) basta.
minimal_ignore_without_ticket() {
  cp "$repo/.gitignore" "$tmp/gitignore-completo"
  printf '%s\n' 'docs/tickets/sem-ticket/*/review.diff' 'docs/tickets/sem-ticket/*/criterios.md' >"$repo/.gitignore"
  mkdir -p "$repo/docs/tickets/sem-ticket/skill-de-revisao"
  printf '1. Um critério.\n' >"$repo/docs/tickets/sem-ticket/skill-de-revisao/criterios.md"
  review sem-ticket skill-de-revisao
  local ok=1
  [[ $code -eq 0 && -s "$repo/docs/tickets/sem-ticket/skill-de-revisao/review.diff" ]] || ok=0
  cp "$tmp/gitignore-completo" "$repo/.gitignore"
  [[ $ok -eq 1 ]]
}
check "sem ticket, um .gitignore que ignora só o diff e os critérios basta" minimal_ignore_without_ticket

# --- um repositório de fora: só a cópia da skill, sem contrato nenhum, com os padrões da base e do desvio

outside="$tmp/fora"
mkdir -p "$outside/$SK/scripts" "$outside/docs/tickets/EX-1/EX-2"
cp "$HERE/../review-inputs.sh" "$outside/$SK/scripts/"
printf '%s\n' 'docs/tickets/*/*/*' '!docs/tickets/*/*/aceite.md' >"$outside/.gitignore"
git -C "$outside" init -q -b main
git -C "$outside" config user.email teste@exemplo.com
git -C "$outside" config user.name Teste
echo base >"$outside/README.md"
git -C "$outside" add -A && git -C "$outside" commit -q -m base
# O remoto de origem: um clone sem nada novo, com o ramo principal main.
git clone -q --bare "$outside" "$tmp/origem.git"
git -C "$outside" remote add origin "$tmp/origem.git"
git -C "$outside" fetch -q origin
git -C "$outside" switch -q -c trabalho
printf '# Aceite do EX-2\n' >"$outside/docs/tickets/EX-1/EX-2/aceite.md"
git -C "$outside" add -A && git -C "$outside" commit -q -m 'plano do EX-2'
echo mudanca >"$outside/novo.txt"

outside_run() {
  out="$(cd "$outside" && $SK/scripts/review-inputs.sh "$@" 2>"$tmp/err")"
  code=$?
  err="$(<"$tmp/err")"
}
outside_defaults() {
  outside_run EX-1 EX-2 &&
    [[ $code -eq 0 ]] &&
    [[ "$(cat "$outside/docs/tickets/EX-1/EX-2/review.diff")" == *"b/novo.txt"* ]] &&
    [[ "$(cat "$outside/docs/tickets/EX-1/EX-2/contract-drift.txt")" == *"Nenhum comando do desvio do contrato"* ]]
}
check "roda num repositório de fora, com os padrões da base e do desvio" outside_defaults

outside_given() {
  printf '#!/usr/bin/env bash\necho "desvio de fora: $1 $3"\n' >"$tmp/desvio-fora"
  chmod +x "$tmp/desvio-fora"
  outside_run --base origin/main --desvio "$tmp/desvio-fora" EX-1 EX-2 &&
    [[ $code -eq 0 ]] &&
    [[ "$(cat "$outside/docs/tickets/EX-1/EX-2/contract-drift.txt")" == *"desvio de fora: "* ]]
}
check "a base e o comando do desvio dados por opção são os que o script usa" outside_given

outside_bad_base() {
  outside_run --base naoexiste EX-1 EX-2
  [[ $code -eq 2 && "$err" == *"naoexiste"* ]]
}
check "uma base que não existe é recusada, dizendo qual" outside_bad_base

# O ramo principal do remoto de origem não é main: a base padrão é o que o remoto diz (origin/HEAD).
outside_other_head() {
  git -C "$outside" update-ref refs/remotes/origin/principal "$(git -C "$outside" rev-parse HEAD)"
  git -C "$outside" remote set-head origin principal >/dev/null
  outside_run EX-1 EX-2
  [[ $code -eq 2 && "$err" == *"origin/principal..HEAD"* ]]
}
check "sem --base, a base é o ramo principal que o remoto de origem diz" outside_other_head

# O comando do desvio pode ter argumentos próprios: eles vão antes do commit de plano.
outside_command_with_arguments() {
  git -C "$outside" remote set-head origin -d >/dev/null
  printf '#!/usr/bin/env bash\necho "recebi: $*"\n' >"$tmp/desvio-args"
  chmod +x "$tmp/desvio-args"
  outside_run --base origin/main --desvio "$tmp/desvio-args um-argumento" EX-1 EX-2 &&
    [[ $code -eq 0 ]] &&
    [[ "$(cat "$outside/docs/tickets/EX-1/EX-2/contract-drift.txt")" == "recebi: um-argumento "* ]]
}
check "o comando do desvio com argumentos próprios os recebe antes do commit de plano" outside_command_with_arguments

finish "do script dos insumos da revisão"
