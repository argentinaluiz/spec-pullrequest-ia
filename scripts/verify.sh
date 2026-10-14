#!/usr/bin/env bash
#
# Verificação do projeto. É a única definição de "passou": a CI chama o modo completo,
# e os hooks chamam o modo rápido e o de antes do push. O desenho está no docs/harness.md.
#
#   scripts/verify.sh fast [app...]                tipos e lint das apps citadas (todas, se nenhuma)
#   scripts/verify.sh full [--start-apps]          o grupo completo de todas as apps, a tabela de
#                                                  aceite e a varredura de segredos; é o veredito,
#                                                  e só ele libera o push
#   scripts/verify.sh full <app>... [--start-apps] só o grupo completo das apps citadas, para o dia
#                                                  a dia; não libera o push
#   scripts/verify.sh prepush                      a varredura de segredos, e a conferência de que o
#                                                  modo completo aprovou o que está no último commit
#   scripts/verify.sh apps                         as apps registradas, uma por linha
#
# Roda tudo nos contêineres do compose.dev.yaml, que já têm de estar no ar. Na suíte no navegador,
# a web e a API também têm de estar respondendo; o `--start-apps` as sobe, e é para a CI.
#
# Com ACCEPTANCE_BODY_FILE apontando para um arquivo com o corpo do pull request, o modo
# completo confere também a tabela de aceite.
#
# Sai com 0 se tudo passou, 1 se alguma verificação falhou e 2 se não deu para verificar.

set -uo pipefail
cd "$(dirname "$0")/.."

# As apps verificadas. O nome é o da pasta em apps/ e o do serviço no Compose. O grupo de cada
# uma fica em scripts/verify/<app>.sh, que define <app>_fast, <app>_full e <app>_reports.
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
# O que a verificação lê. Só uma mudança nestes caminhos invalida a aprovação do modo completo.
VERIFIED_PATHS=(apps compose.dev.yaml scripts)
# Onde o modo completo registra o que aprovou. Fica na pasta do Git, fora do versionamento.
APPROVAL_FILE="$(git rev-parse --git-dir)/harness/full-ok"

failures=()

usage() {
  sed -n '3,22p' "$0" | sed 's/^# \{0,1\}//'
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

# Confere a tabela de aceite do pull request contra os relatórios que as apps declaram em
# <app>_reports. A tabela só é exigida quando a branch altera código em apps/.
acceptance() {
  local mode=--optional app ref spec prefix rest report target specs=()
  # Conta também o que ainda não foi commitado: na máquina, o modo completo costuma rodar antes
  # do commit, e a tabela não pode passar como "não exigida" só por isso.
  if [[ -n "$(git diff --name-only "$(git merge-base "$BASE_REF" HEAD)" -- apps/)" ||
    -n "$(git ls-files --others --exclude-standard -- apps/)" ]]; then
    mode=--required
  fi

  # O conferidor roda no contêiner `api`, que só enxerga a própria pasta. O corpo do PR e os
  # relatórios de cada app chegam a ele pela entrada padrão, sem depender da permissão da pasta.
  in_container api sh -c 'mkdir -p reports/acceptance && cat >reports/acceptance/pr-body.md' \
    <"$ACCEPTANCE_BODY_FILE" || return 1
  for app in "${APPS[@]}"; do
    ref="${app}_reports[@]"
    for spec in "${!ref}"; do
      prefix="${spec%%=*}"
      rest="${spec#*=}"
      report="${rest#*:}"
      target="reports/acceptance/$app-$(basename "$report")"
      in_container "$app" cat "$report" |
        in_container api sh -c "cat >'$target'" || return 1
      specs+=("$prefix=${rest%%:*}:$target")
    done
  done

  in_container api node - "$mode" reports/acceptance/pr-body.md "${specs[@]}" \
    <scripts/check-acceptance.cjs
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
    echo "O modo completo aprovou este conteúdo, mas sem conferir a tabela de aceite, e a branch altera código em apps/."
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
  rm -f "$APPROVAL_FILE"

  for app in "${APPS[@]}"; do
    "${app}_full"
  done

  # Só há tabela para conferir quando há um corpo de pull request: na CI, ou na máquina,
  # com o corpo num arquivo apontado por ACCEPTANCE_BODY_FILE.
  if [[ -n "${ACCEPTANCE_BODY_FILE:-}" ]]; then
    step "Tabela de aceite" \
      "corrija a tabela no corpo do pull request, no formato descrito no AGENTS.md da raiz, ou escreva o teste que falta." \
      acceptance
  fi

  step "Segredos nos commits da branch" \
    "tire o segredo do código, troque-o na origem (ele já vazou para o histórico) e reescreva o commit que o trouxe." \
    secret_scan
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
