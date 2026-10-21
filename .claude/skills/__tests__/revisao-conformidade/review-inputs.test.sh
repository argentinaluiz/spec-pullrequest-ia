#!/usr/bin/env bash
#
# Testes do script dos insumos da revisão de conformidade (scripts/review-inputs.sh): os argumentos, o diff da branch com os
# arquivos novos sem mexer no índice, a base pelo ponto em que a branch saiu dela, o commit de plano exigido e a mensagem
# dele, o desvio do contrato gravado sempre, a mudança sem ticket, que exige os critérios, e se a mudança pede revisão. O
# script roda copiado num repositório temporário, só com os arquivos das skills que ele carrega (a base da worktree, o diff
# da skill de plano e o padrão de caminho da proteger-harness): a base chega pela HARNESS_BASE_REF e o resto, pelo
# .config/project do repositório, e o comando do desvio é um falso (a comparação real tem os próprios testes). Não carrega
# arquivo de projeto. Roda na máquina. Os casos de aceite se ligam aos critérios pelo mapa de testes do ticket, e não pelo
# nome.

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../helpers.sh
source "$HERE/../helpers.sh"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
repo="$tmp/repo"

not() {
  ! "$@"
}

contains() {
  [[ "$1" == *"$2"* ]]
}

# install_kit <repositório>: copia para o repositório o script e os arquivos das skills que ele carrega, nos caminhos delas.
SKILLS="$(cd "$HERE/../.." && pwd)"
install_kit() {
  local file
  for file in revisao-conformidade/scripts/review-inputs.sh worktree/scripts/harness-base.sh plan-ticket/scripts/plan-git.sh \
    proteger-harness/scripts/path-pattern.sh; do
    mkdir -p "$1/.claude/skills/$(dirname "$file")"
    cp "$SKILLS/$file" "$1/.claude/skills/$file"
  done
}

# O repositório: a cópia do script e do que ele carrega, a configuração do projeto e as regras de .gitignore da pasta dos
# tickets, na main.
SK=.claude/skills/revisao-conformidade
mkdir -p "$repo/apps/api" "$repo/docs/tickets/PROJ-1/PROJ-3" "$repo/.config"
install_kit "$repo"
printf '[tickets]\n\tpasta = docs/tickets\n[contrato]\n\tdesvio = %s\n[revisao]\n\tsempre = apps/**\n' "$tmp/desvio" >"$repo/.config/project"
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

# review <argumentos...>: roda o script no repositório temporário, contra a main dele, com o comando do desvio falso da
# configuração, e deixa a saída em $out, a saída de erro em $err e o código em $code.
review() {
  local errfile="$tmp/err"
  out="$(cd "$repo" && HARNESS_BASE_REF=main $SK/scripts/review-inputs.sh "$@" 2>"$errfile")"
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

# --- sem a pasta dos tickets na configuração

no_tickets_folder() {
  cp "$repo/.config/project" "$tmp/project"
  printf '[contrato]\n\tdesvio = %s\n[revisao]\n\tsempre = apps/**\n' "$tmp/desvio" >"$repo/.config/project"
  review PROJ-1 PROJ-2
  cp "$tmp/project" "$repo/.config/project"
  [[ $code -eq 2 && "$err" == *"tickets.pasta"* ]]
}
check "sem a pasta dos tickets no .config/project, recusa e diz qual chave falta" no_tickets_folder

# --- um repositório de fora: só as skills, sem contrato nenhum, com a base padrão e sem o comando do desvio

outside="$tmp/fora"
mkdir -p "$outside/docs/tickets/EX-1/EX-2" "$outside/.config"
install_kit "$outside"
printf '[tickets]\n\tpasta = docs/tickets\n[revisao]\n\tsempre = **\n' >"$outside/.config/project"
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

# outside_run <argumentos...>: roda o script no repositório de fora, sem a HARNESS_BASE_REF de quem roda os testes (a CI a
# define), salvo a que o caso dá em OUTSIDE_BASE.
outside_run() {
  out="$(cd "$outside" && env -u HARNESS_BASE_REF ${OUTSIDE_BASE:+HARNESS_BASE_REF="$OUTSIDE_BASE"} "$SK/scripts/review-inputs.sh" "$@" 2>"$tmp/err")"
  code=$?
  err="$(<"$tmp/err")"
}
# outside_config [desvio]: a configuração do repositório de fora, com o comando do desvio dado ou sem nenhum.
outside_config() {
  printf '[tickets]\n\tpasta = docs/tickets\n[revisao]\n\tsempre = **\n' >"$outside/.config/project"
  [[ -z "${1:-}" ]] || printf '[contrato]\n\tdesvio = %s\n' "$1" >>"$outside/.config/project"
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
  outside_config "$tmp/desvio-fora"
  OUTSIDE_BASE=origin/main outside_run EX-1 EX-2
  local ok=$code
  outside_config
  [[ $ok -eq 0 ]] &&
    [[ "$(cat "$outside/docs/tickets/EX-1/EX-2/contract-drift.txt")" == *"desvio de fora: "* ]]
}
check "a base da HARNESS_BASE_REF e o comando do desvio do .config/project são os que o script usa" outside_given

outside_bad_base() {
  OUTSIDE_BASE=naoexiste outside_run EX-1 EX-2
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
check "sem a HARNESS_BASE_REF, a base é o ramo principal que o remoto de origem diz" outside_other_head

# O comando do desvio pode ter argumentos próprios: eles vão antes do commit de plano.
outside_command_with_arguments() {
  git -C "$outside" remote set-head origin -d >/dev/null
  printf '#!/usr/bin/env bash\necho "recebi: $*"\n' >"$tmp/desvio-args"
  chmod +x "$tmp/desvio-args"
  outside_config "$tmp/desvio-args um-argumento"
  OUTSIDE_BASE=origin/main outside_run EX-1 EX-2
  outside_config
  [[ $code -eq 0 ]] &&
    [[ "$(cat "$outside/docs/tickets/EX-1/EX-2/contract-drift.txt")" == "recebi: um-argumento "* ]]
}
check "o comando do desvio com argumentos próprios os recebe antes do commit de plano" outside_command_with_arguments

# --- se a mudança pede revisão: os padrões de revisao.sempre e, num ticket com aceite, os bloqueado da lista de protegidos

need_case() {
  local result=0
  printf 'bloqueado\tscripts/**\n' >"$outside/.config/protegidos"
  printf '[tickets]\n\tpasta = docs/tickets\n[revisao]\n\tsempre = apps/**\n[protegidos]\n\tlista = .config/protegidos\n' \
    >"$outside/.config/project"
  rm -f "$outside/docs/tickets/EX-1/EX-2/review.diff"
  # Só um arquivo fora dos padrões (o novo.txt da raiz): não pede revisão, sai com 3 e não grava nada.
  outside_run EX-1 EX-2
  [[ $code -eq 3 && "$out" == *"não pede revisão"* && ! -e "$outside/docs/tickets/EX-1/EX-2/review.diff" ]] || result=1
  # Um script do harness, com ticket: pede revisão pelo bloqueado da lista, e diz o arquivo e o padrão.
  mkdir -p "$outside/scripts" && echo 'echo x' >"$outside/scripts/x.sh"
  outside_run EX-1 EX-2
  [[ $code -eq 0 && "$out" == *'scripts/x.sh casa com `scripts/**` (bloqueado de .config/protegidos)'* ]] || result=1
  # Sem ticket, o bloqueado da lista não pede revisão.
  mkdir -p "$outside/docs/tickets/sem-ticket/harness"
  printf '1. Um critério.\n' >"$outside/docs/tickets/sem-ticket/harness/criterios.md"
  outside_run sem-ticket harness
  [[ $code -eq 3 ]] || result=1
  # Um arquivo de apps/ pede revisão com ou sem ticket.
  mkdir -p "$outside/apps" && echo x >"$outside/apps/a.ts"
  outside_run sem-ticket harness
  [[ $code -eq 0 && "$out" == *'apps/a.ts casa com `apps/**` (revisao.sempre)'* ]] || result=1
  rm -rf "$outside/scripts" "$outside/apps" "$outside/docs/tickets/sem-ticket" "$outside/.config/protegidos"
  outside_config
  return $result
}
check "pede revisão pelo revisao.sempre com ou sem ticket e pelo bloqueado da lista só com ticket, e sem nenhum sai com 3 sem gravar nada" need_case

missing_patterns_case() {
  local result=0
  printf '[tickets]\n\tpasta = docs/tickets\n' >"$outside/.config/project"
  outside_run EX-1 EX-2
  [[ $code -eq 2 && "$err" == *"revisao.sempre"* ]] || result=1
  printf '[tickets]\n\tpasta = docs/tickets\n[revisao]\n\tsempre = apps/**\n[protegidos]\n\tlista = .config/nao-existe\n' \
    >"$outside/.config/project"
  outside_run EX-1 EX-2
  [[ $code -eq 2 && "$err" == *".config/nao-existe"* ]] || result=1
  outside_config
  return $result
}
check "sem o código que pede revisão, ou com a lista de protegidos que não se lê, recusa com 2 e diz o que falta" missing_patterns_case

renamed_out_case() {
  # O arquivo existe na base: a main de origem o ganha, e a branch a traz antes de tirá-lo de apps/ (o último caso, porque
  # muda a base do repositório de fora).
  git -C "$outside" switch -q main
  mkdir -p "$outside/apps"
  printf 'export const a = 1;\nexport const b = 2;\nexport const c = 3;\n' >"$outside/apps/movido.ts"
  git -C "$outside" add apps/movido.ts && git -C "$outside" commit -q -m 'arquivo em apps'
  git -C "$outside" push -q origin main && git -C "$outside" fetch -q origin
  git -C "$outside" switch -q trabalho && git -C "$outside" merge -q --no-edit origin/main >/dev/null
  git -C "$outside" mv apps/movido.ts movido.ts && git -C "$outside" commit -q -m 'move para fora de apps'
  printf '[tickets]\n\tpasta = docs/tickets\n[revisao]\n\tsempre = apps/**\n' >"$outside/.config/project"
  OUTSIDE_BASE=origin/main outside_run EX-1 EX-2
  [[ $code -eq 0 && "$out" == *'apps/movido.ts casa com `apps/**`'* ]]
}
check "o arquivo que a branch tira de um caminho que pede revisão, renomeando-o, pede revisão pelo nome antigo" renamed_out_case

finish "do script dos insumos da revisão"
