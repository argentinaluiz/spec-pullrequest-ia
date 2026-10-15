#!/usr/bin/env bash
#
# Verificação do projeto. É a única definição de "passou": a CI chama o modo completo,
# e os hooks chamam o modo rápido e o de antes do push. O desenho está no docs/harness.md.
#
#   scripts/verify.sh fast [app...]                tipos e lint das apps citadas (todas, se nenhuma)
#   scripts/verify.sh full [--start-apps]          o grupo completo de todas as apps, os testes do
#                                                  harness, o aceite e a varredura de segredos; é o
#                                                  veredito, e só ele libera o push
#   scripts/verify.sh full <app>... [--start-apps] só o grupo completo das apps citadas, para o dia
#                                                  a dia; não libera o push
#   scripts/verify.sh prepush                      a varredura de segredos, e a conferência de que o
#                                                  modo completo aprovou o que está no último commit
#   scripts/verify.sh apps                         as apps registradas, uma por linha
#   scripts/verify.sh contract [<de> [<para>]]     a visão legível do contrato e do schema entre dois
#                                                  pontos do Git (commits, ou a árvore do índice), em
#                                                  Markdown; sem <para>, até a pasta de trabalho, e
#                                                  sem nenhum, do HEAD até ela. É o comando do
#                                                  contrato da skill de plano
#   scripts/verify.sh plan <ticket> [<commit>]     atalho para o plan-page.sh da skill de plano, com
#                                                  os valores deste projeto
#
# Roda tudo nos contêineres do compose.dev.yaml, que já têm de estar no ar. Na suíte no navegador,
# a web e a API também têm de estar respondendo; o `--start-apps` as sobe, e é para a CI.
#
# Com ACCEPTANCE_BODY_FILE apontando para um arquivo com o corpo do pull request, o modo
# completo confere também o aceite: a seção "Aceite" do PR e a cobertura dos critérios por testes.
# E, sem bloquear, avisa quando o contrato ou o schema mudou depois do commit de plano.
#
# Sai com 0 se tudo passou, 1 se alguma verificação falhou e 2 se não deu para verificar.

set -uo pipefail
cd "$(dirname "$0")/.."

# As apps verificadas. O nome é o da pasta em apps/ e o do serviço no Compose. O grupo de cada
# uma fica em scripts/verify/<app>.sh, que define <app>_fast, <app>_full e <app>_reports, e, se a
# app tem contrato planejado, <app>_contract_drift.
APPS=(api web)

COMPOSE=(docker compose -f compose.dev.yaml)
# O mesmo comando, como texto, para as mensagens de como corrigir.
EXEC="${COMPOSE[*]} exec"
# Se a suíte no navegador pode subir a web e a API. O `--start-apps` liga.
START_APPS=no
# Versão fixa, para o mesmo diff dar sempre o mesmo resultado.
GITLEAKS_IMAGE=ghcr.io/gitleaks/gitleaks:v8.30.1
# A varredura de segredos olha os commits que a branch tem a mais do que esta referência.
BASE_REF="${HARNESS_BASE_REF:-origin/main}"
# O fim da branch, para o desvio do plano. Na CI de um pull request, a pasta de trabalho é o merge da
# branch na main, e a main traria as próprias mudanças como desvio: a CI aponta o commit da branch.
# Vazio, o desvio compara com a pasta de trabalho.
HEAD_REF="${HARNESS_HEAD_REF:-}"
# Os scripts da skill de plano: o parser do aceite, que o conferidor importa, e a página do plano. O
# scripts/node-in-api.sh os leva ao contêiner com os mesmos caminhos.
PLAN_SKILL_SCRIPTS=.claude/skills/plan-ticket/scripts
# O que a verificação lê. Só uma mudança nestes caminhos invalida a aprovação do modo completo.
VERIFIED_PATHS=(apps compose.dev.yaml scripts "$PLAN_SKILL_SCRIPTS" docs/aceite)
# O estado interno da verificação (as aprovações) fica na pasta do Git, fora do versionamento, onde
# ninguém precisa lê-lo.
HARNESS_DIR="$(git rev-parse --absolute-git-dir)/harness"
# Onde o modo completo registra o que aprovou.
APPROVAL_FILE="$HARNESS_DIR/full-ok"
# A pasta de cada ticket, fora do versionamento. O que fica nela está no docs/harness.md, etapa 7.
TICKETS_DIR=docs/tickets

failures=()

usage() {
  # O cabeçalho deste arquivo, até a primeira linha em branco.
  sed -n '3,/^$/p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

for app in "${APPS[@]}"; do
  # shellcheck source=/dev/null
  source "scripts/verify/$app.sh"
done

# Sai com o uso se algum nome não é de uma app registrada.
check_apps() {
  local app
  for app in "$@"; do
    [[ " ${APPS[*]} " == *" $app "* ]] || usage
  done
}

# Não deu para verificar: falha fechada, com o que fazer.
abort() {
  printf '\nNÃO VERIFICADO: %s\n' "$1" >&2
  printf 'Como resolver: %s\n' "$2" >&2
  exit 2
}

# Um comando que não verifica falhou: o erro e o que fazer, e devolve 1.
# fail <erro> <como corrigir>
fail() {
  printf '\n%s\n' "$1" >&2
  printf 'Como corrigir: %s\n' "$2" >&2
  return 1
}

# step <nome> <como corrigir> <comando...>
step() {
  local name="$1" hint="$2"
  shift 2
  printf '\n=== %s\n' "$name"
  if "$@"; then
    return 0
  fi
  failures+=("$name"$'\n'"    Como corrigir: $hint")
  return 1
}

in_container() {
  local service="$1"
  shift
  "${COMPOSE[@]}" exec -T "$service" "$@"
}

require_container() {
  in_container "$1" true >/dev/null 2>&1 ||
    abort "o contêiner \`$1\` não está no ar." \
      "suba o ambiente com \`${COMPOSE[*]} up -d --build --wait\` e rode de novo."
}

# Confere o relatório JSON de uma suíte dentro do contêiner, onde está o Node.
check_report() {
  local service="$1" kind="$2" file="$3"
  in_container "$service" node - "$kind" "$file" <scripts/check-report.cjs
}

responds() {
  in_container "$1" node -e \
    "fetch('$2').then(() => process.exit(0), () => process.exit(1))" >/dev/null 2>&1
}

wait_for() {
  local service="$1" url="$2"
  for _ in $(seq 1 90); do
    responds "$service" "$url" && return 0
    sleep 2
  done
  return 1
}

# Roda o Node no contêiner `api`, em reports/<subpasta>/ da API, pelo scripts/node-in-api.sh, que
# leva para lá os scripts do harness, os da skill de plano e o conteúdo da <pasta de dados>. Os
# <argumentos> são o script como arquivo, como `scripts/check-acceptance.cjs`, e os dele.
# node_in_api <subpasta> <pasta de dados, ou vazio> <argumentos do node...>
node_in_api() {
  local subdir="$1" data="$2"
  shift 2
  scripts/node-in-api.sh --subpasta "$subdir" ${data:+--dados "$data"} "$@"
}

# Roda os testes do harness: os do conferidor, do renderizador do contrato e os da skill de plano (o
# parser e a página do plano) no contêiner `api`, e os do hook de congelamento na máquina.
harness_tests() {
  # O repórter próprio grava o relatório no formato do Vitest, para o `check_report` e o conferidor
  # lerem; o repórter `spec` segue na saída, para quem lê o log. Os testes são os mesmos caminhos
  # relativos aqui e no contêiner, então a lista sai daqui.
  node_in_api harness "" --test --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter=./scripts/test/node-test-report.cjs --test-reporter-destination=node-tests.json \
    scripts/test/*.test.cjs "$PLAN_SKILL_SCRIPTS"/test/*.test.cjs &&
    check_report api vitest reports/harness/node-tests.json &&
    # O hook de congelamento usa o `git` e o `jq`, que o contêiner não tem: o teste dele roda aqui.
    scripts/test/freeze-acceptance.test.sh
}

# O arquivo de aceite citado na seção "Aceite" do corpo do pull request, lido pelo mesmo conferidor,
# do corpo que o `acceptance` já entregou ao contêiner `api` (em reports/acceptance/). Não imprime
# nada quando não há corpo e quando a seção diz "nenhum".
cited_acceptance() {
  node_in_api cited "" scripts/check-acceptance.cjs --cited ../acceptance/pr-body.md
}

# ticket_dir <ticket>
ticket_dir() {
  printf '%s/%s' "$TICKETS_DIR" "$1"
}

# O `git diff` que a visão do contrato lê: sem cor nem diff externo, com os prefixos `a/` e `b/` fixos
# e os caminhos com acento sem aspas, seja qual for a configuração do Git de quem roda
# (`diff.noprefix`, `diff.mnemonicPrefix`, `core.quotePath`), como o da página do plano.
# plain_diff <argumentos do git diff...>
plain_diff() {
  git -c core.quotePath=false --no-pager diff --no-color --no-ext-diff --src-prefix=a/ --dst-prefix=b/ "$@"
}

# O commit mais recente de <commits> (um intervalo ou um ponto, como no `git log`) que criou o
# <arquivo>. Não imprime nada quando nenhum o criou, e falha quando o `git log` não lê o histórico.
# added_by <commits> <arquivo>
added_by() {
  local commits
  commits="$(git log --diff-filter=A --format=%H "$1" -- "$2")" || return 1
  printf '%s' "${commits%%$'\n'*}"
}

# O commit de plano: o mais recente da branch que criou o arquivo de aceite, que é o plano em
# vigor. Não imprime nada quando nenhum commit da branch o criou (um ticket antigo, ou o plano ainda
# sem commit). Falha quando o `git log` não lê o histórico da branch.
# plan_commit <arquivo de aceite>
plan_commit() {
  added_by "$BASE_REF..${HEAD_REF:-HEAD}" "$1"
}

# O desvio do plano, comparado pelo grupo de cada app que declara <app>_contract_drift. Cada uma
# acrescenta a própria visão ao contract-drift.txt da pasta do ticket, que o `run_full` apaga no
# começo. Depois do `acceptance`, que entrega o corpo do PR ao contêiner. Só avisa: nunca falha.
contract_drift() {
  local file plan app drift
  if [[ -n "$HEAD_REF" ]] && ! git rev-parse --verify --quiet "$HEAD_REF^{commit}" >/dev/null; then
    echo "HARNESS_HEAD_REF aponta \`$HEAD_REF\`, que não é um commit deste clone, e o desvio não foi conferido. Aponte o commit da branch, ou deixe a variável vazia para comparar com a pasta de trabalho."
  elif ! file="$(cited_acceptance)"; then
    echo "Não deu para ler a seção \"Aceite\" do corpo do PR no contêiner \`api\`, e o desvio não foi conferido."
  elif [[ -z "$file" ]]; then
    echo "Não há commit de plano para comparar: o corpo do PR não cita, na seção \"Aceite\", um arquivo de aceite."
  elif ! plan="$(plan_commit "$file")"; then
    echo "Não deu para ler o histórico da branch ($BASE_REF..${HEAD_REF:-HEAD}) com o \`git log\`, e o desvio não foi conferido. Confira se a base existe (\`git fetch origin\`, ou outra base em HARNESS_BASE_REF) e se o clone tem o histórico inteiro (\`git fetch --unshallow\`; na CI, \`fetch-depth: 0\` no checkout)."
  elif [[ -z "$plan" ]]; then
    echo "Não há commit de plano para comparar: nenhum commit desta branch criou o $file, citado na seção \"Aceite\" do corpo do PR."
  else
    drift="$(ticket_dir "$(basename "$file" .md)")/contract-drift.txt"
    for app in "${APPS[@]}"; do
      if declare -F "${app}_contract_drift" >/dev/null; then
        "${app}_contract_drift" "$plan" "$HEAD_REF" "$drift"
      fi
    done
  fi
  return 0
}

# Confere o aceite contra os relatórios que as apps declaram em <app>_reports: a seção "Aceite" do
# pull request e a cobertura dos critérios de todos os tickets. A seção só é exigida quando a
# branch altera código em apps/.
acceptance() {
  local mode=--optional app ref spec report name dir code error body="${ACCEPTANCE_BODY_FILE:-}" specs=()
  # Conta também o que ainda não foi commitado: na máquina, o modo completo costuma rodar antes
  # do commit, e a tabela não pode passar como "não exigida" só por isso.
  if [[ -n "$body" ]] && [[ -n "$(git diff --name-only "$(git merge-base "$BASE_REF" HEAD)" -- apps/)" ||
    -n "$(git ls-files --others --exclude-standard -- apps/)" ]]; then
    mode=--required
  fi

  # O conferidor roda no contêiner `api` (`node_in_api`), sobre uma pasta com o corpo do PR, os
  # arquivos de aceite e os relatórios de cada app. Um relatório que não pôde ser copiado fica de
  # fora, com o erro da cópia e o que fazer, e o conferidor reprova dizendo qual. O corpo fica em
  # reports/acceptance/ para o `contract_drift`.
  dir="$(mktemp -d)" || return 1
  cp "${body:-/dev/null}" "$dir/pr-body.md" && cp -R docs/aceite "$dir/aceite" || { rm -rf "$dir"; return 1; }
  # O relatório dos testes do harness já está no contêiner `api`, em reports/harness/.
  specs+=(vitest:../harness/node-tests.json)
  for app in "${APPS[@]}"; do
    ref="${app}_reports[@]"
    for spec in "${!ref}"; do
      report="${spec#*:}"
      name="$app-$(basename "$report")"
      # O relatório vai para o arquivo, e o erro do `docker` ou do `cat`, para a variável.
      if ! error="$(in_container "$app" cat "$report" 2>&1 >"$dir/$name")"; then
        rm -f "$dir/$name"
        printf '\nO relatório %s não pôde ser copiado do contêiner `%s`: %s\n' "$report" "$app" "${error:-sem mensagem de erro.}" >&2
        printf 'Como corrigir: se o contêiner não está no ar, suba o ambiente com `%s up -d --build --wait`; se o relatório não existe, a suíte que o grava não rodou ou parou antes: veja o passo dela acima e rode `scripts/verify.sh full` de novo.\n' "${COMPOSE[*]}" >&2
      fi
      specs+=("${spec%%:*}:$name")
    done
  done

  node_in_api acceptance "$dir" scripts/check-acceptance.cjs "$mode" pr-body.md aceite "${specs[@]}"
  code=$?
  rm -rf "$dir"
  return $code
}

require_base() {
  git rev-parse --verify --quiet "$BASE_REF" >/dev/null ||
    abort "a referência \`$BASE_REF\` não existe neste clone." \
      "rode \`git fetch origin\`, ou aponte outra base com a variável HARNESS_BASE_REF."
}

secret_scan() {
  require_base
  docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/repo" "$GITLEAKS_IMAGE" \
    git /repo --no-banner --redact --log-opts="$BASE_REF..HEAD"
}

# Resumo do conteúdo dos caminhos que a verificação lê, numa árvore do Git.
tree_state() {
  local path
  for path in "${VERIFIED_PATHS[@]}"; do
    git rev-parse --verify --quiet "$1:$path" || echo ausente
  done | sha256sum | cut -d' ' -f1
}

# O mesmo resumo, para a pasta de trabalho: é ela que o modo completo verifica. Usa um índice
# temporário, para contar o que ainda não foi commitado sem mexer no índice de quem trabalha.
worktree_state() {
  local dir tree
  dir="$(mktemp -d)" || return 1
  tree="$(
    export GIT_INDEX_FILE="$dir/index"
    git read-tree HEAD && git add -A -- "${VERIFIED_PATHS[@]}" && git write-tree
  )"
  rm -rf "$dir"
  [[ -n "$tree" ]] || return 1
  tree_state "$tree"
}

# Confere que o modo completo aprovou exatamente o que está no último commit.
approval() {
  if git diff --quiet "$BASE_REF...HEAD" -- "${VERIFIED_PATHS[@]}"; then
    echo "A branch não altera nada do que a verificação lê. Não precisa de aprovação."
    return 0
  fi

  local approved acceptance
  approved="$(sed -n 's/^state=//p' "$APPROVAL_FILE" 2>/dev/null)"
  acceptance="$(sed -n 's/^acceptance=//p' "$APPROVAL_FILE" 2>/dev/null)"

  if [[ -z "$approved" || "$approved" != "$(tree_state HEAD)" ]]; then
    echo "O modo completo não aprovou o conteúdo do último commit."
    return 1
  fi
  if [[ "$acceptance" != checked ]] && ! git diff --quiet "$BASE_REF...HEAD" -- apps/; then
    echo "O modo completo aprovou este conteúdo, mas sem conferir o aceite, e a branch altera código em apps/."
    return 1
  fi
  echo "O modo completo aprovou o conteúdo do último commit."
}

run_prepush() {
  require_base
  step "Segredos nos commits da branch" \
    "tire o segredo do código e reescreva o commit que o trouxe. Ele ainda não saiu da máquina." \
    secret_scan
  step "Aprovação do modo completo" \
    "faça o commit de tudo, salve o corpo do pull request num arquivo e rode \`ACCEPTANCE_BODY_FILE=<arquivo> scripts/verify.sh full\`. Se mudar algo em ${VERIFIED_PATHS[*]} depois, rode de novo." \
    approval
}

# O veredito: o grupo completo de todas as apps, mais o que atravessa as apps.
run_full() {
  local app
  require_base
  # O estado é resumido antes de tudo, para a aprovação valer para o que foi verificado, e não
  # para o que estiver na pasta quando a verificação terminar.
  verified_state="$(worktree_state)" || abort "não deu para resumir o estado da pasta de trabalho." \
    "confira se o repositório do Git está íntegro, com \`git status\`."
  # A visão do desvio também é desta execução: uma interrompida não deixa uma antiga para o revisor.
  rm -f "$APPROVAL_FILE" "$TICKETS_DIR"/*/contract-drift.txt

  for app in "${APPS[@]}"; do
    "${app}_full"
  done

  step "Testes do harness" \
    "corrija o script ou o teste que falhou, em scripts/ ou em $PLAN_SKILL_SCRIPTS/ (os testes da skill ficam em $PLAN_SKILL_SCRIPTS/test/), e rode \`scripts/verify.sh full\` de novo." \
    harness_tests

  # A cobertura dos critérios roda sempre. A seção "Aceite" só é conferida quando há um corpo de
  # pull request: na CI, ou na máquina, com o corpo num arquivo apontado por ACCEPTANCE_BODY_FILE.
  step "Aceite" \
    "acerte a seção \"Aceite\" do corpo do pull request, no formato do AGENTS.md da raiz, ou escreva o teste do critério que falta, com o ID no título." \
    acceptance

  # Depois do "Aceite", que entrega o corpo do PR ao contêiner. Só avisa: nunca entra nas falhas.
  step "Contrato e schema contra o commit de plano" \
    "o passo só avisa e não falha." \
    contract_drift

  step "Segredos nos commits da branch" \
    "tire o segredo do código, troque-o na origem (ele já vazou para o histórico) e reescreva o commit que o trouxe." \
    secret_scan
}

# Valida um ponto da visão do contrato: um commit, ou o id de uma árvore da raiz, como o da árvore do
# índice que o `git write-tree` imprime. Uma subárvore (`<commit>:<caminho>`) não vale: os caminhos
# do snapshot e do schema são lidos a partir da raiz.
require_point() {
  git rev-parse --verify --quiet "$1^{commit}" >/dev/null 2>&1 && return 0
  [[ "$1" =~ ^[0-9a-f]{4,64}$ && "$(git cat-file -t "$1" 2>/dev/null)" == tree ]] ||
    abort "\`$1\` não é um commit nem o id da árvore da raiz deste repositório." \
      "passe um commit, uma branch ou uma tag existente, como \`HEAD\` ou \`origin/main\`, ou o id que o \`git write-tree\` imprime."
}

# O atalho do modo `plan`: o plan-page.sh da skill de plano, com os valores deste projeto. O dono dos
# valores é o AGENTS.md da raiz ("Plano do ticket", "Valores da skill de plano"); o atalho só os passa.
# A lógica e as mensagens são do script.
# run_plan <ticket> [<commit>]
run_plan() {
  local args=(
    --ticket "$1" --aceite docs/aceite --tickets "$TICKETS_DIR" --documentos docs
    --node scripts/node-in-api.sh --contrato "scripts/verify.sh contract"
    --contrato-arquivos "$API_SNAPSHOT $API_SCHEMA"
  )
  [[ -n "${2:-}" ]] && args+=(--commit "$2")
  "$PLAN_SKILL_SCRIPTS/plan-page.sh" "${args[@]}"
}

mode="${1:-}"
[[ $# -gt 0 ]] && shift

# As apps citadas no `full`. Sem nenhuma, ele é o veredito.
apps=()

case "$mode" in
  fast)
    apps=("$@")
    [[ ${#apps[@]} -eq 0 ]] && apps=("${APPS[@]}")
    check_apps "${apps[@]}"
    for app in "${apps[@]}"; do
      "${app}_fast"
    done
    apps=()
    ;;
  full)
    for arg in "$@"; do
      case "$arg" in
        --start-apps) START_APPS=yes ;;
        -*) usage ;;
        *) apps+=("$arg") ;;
      esac
    done
    if [[ ${#apps[@]} -eq 0 ]]; then
      run_full
    else
      check_apps "${apps[@]}"
      for app in "${apps[@]}"; do
        "${app}_full"
      done
    fi
    ;;
  prepush)
    [[ $# -eq 0 ]] || usage
    run_prepush
    ;;
  apps)
    [[ $# -eq 0 ]] || usage
    printf '%s\n' "${APPS[@]}"
    exit 0
    ;;
  contract)
    # A visão não é verificação: não aprova nada. Ela é a do contrato da API, que é o contrato que
    # o plano escreve, e por isso chama o grupo da API direto, e não percorre o registro.
    [[ $# -le 2 ]] || usage
    from="${1:-HEAD}"
    to="${2:-}"
    require_point "$from"
    [[ -z "$to" ]] || require_point "$to"
    require_container api
    api_contract_view "$from" "$to" ||
      fail "A visão do contrato não pôde ser montada: o erro está acima." \
        "corrija o que ele aponta (num snapshot ilegível, o JSON de $API_SNAPSHOT, no ponto que o oasdiff mostra) e rode \`scripts/verify.sh contract\` de novo."
    exit $?
    ;;
  plan)
    # A página não é verificação: não aprova nada.
    [[ $# -ge 1 && $# -le 2 ]] || usage
    run_plan "$@"
    exit $?
    ;;
  *) usage ;;
esac

if [[ ${#failures[@]} -gt 0 ]]; then
  printf '\nREPROVADO: %d verificação(ões) falharam.\n' "${#failures[@]}" >&2
  for failure in "${failures[@]}"; do
    printf -- '- %s\n' "$failure" >&2
  done
  exit 1
fi

if [[ ${#apps[@]} -gt 0 ]]; then
  printf '\nAPROVADO (%s %s).\n' "$mode" "${apps[*]}"
  printf 'Isto não libera o push: rode `scripts/verify.sh full`, sem apps, antes de enviar.\n'
  exit 0
fi

# Registra o que o modo completo aprovou, para o hook de antes do push conferir.
if [[ "$mode" == full ]]; then
  mkdir -p "$(dirname "$APPROVAL_FILE")"
  printf 'state=%s\nacceptance=%s\n' "$verified_state" \
    "$([[ -n "${ACCEPTANCE_BODY_FILE:-}" ]] && echo checked || echo skipped)" >"$APPROVAL_FILE"
fi

printf '\nAPROVADO (%s).\n' "$mode"
