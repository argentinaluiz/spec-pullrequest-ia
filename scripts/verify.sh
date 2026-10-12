#!/usr/bin/env bash
#
# Verificação do projeto. É a única definição de "passou": a CI chama o modo completo,
# e os hooks chamam o modo rápido. O desenho está no docs/harness.md.
#
#   scripts/verify.sh fast [api] [web]     tsc e lint dos projetos citados (os dois, se nenhum)
#   scripts/verify.sh full [--start-apps]  o modo rápido, as suítes de teste, o build da web
#                                          e a varredura de segredos
#
# Roda tudo nos contêineres do compose.dev.yaml, que já têm de estar no ar. No modo completo,
# a web e a API também têm de estar respondendo; o `--start-apps` as sobe, e é para a CI.
#
# Com ACCEPTANCE_BODY_FILE apontando para um arquivo com o corpo do pull request, o modo
# completo confere também a tabela de aceite.
#
# Sai com 0 se tudo passou, 1 se alguma verificação falhou e 2 se não deu para verificar.

set -uo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f compose.dev.yaml)
# Versão fixa, para o mesmo diff dar sempre o mesmo resultado.
GITLEAKS_IMAGE=ghcr.io/gitleaks/gitleaks:v8.30.1
# A varredura de segredos olha os commits que a branch tem a mais do que esta referência.
BASE_REF="${HARNESS_BASE_REF:-origin/main}"

failures=()

usage() {
  sed -n '3,16p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
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
      "suba o ambiente com \`docker compose -f compose.dev.yaml up -d --build --wait\` e rode de novo."
}

# Confere o relatório JSON de uma suíte dentro do contêiner, onde está o Node.
check_report() {
  local service="$1" kind="$2" file="$3"
  in_container "$service" node - "$kind" "$file" <scripts/check-report.cjs
}

fast_api() {
  require_container api
  step "API: tipos" \
    "corrija os erros apontados e rode \`docker compose -f compose.dev.yaml exec api pnpm exec tsc --noEmit\`." \
    in_container api pnpm exec tsc --noEmit
  step "API: lint" \
    "corrija os problemas apontados e rode \`docker compose -f compose.dev.yaml exec api pnpm lint\`." \
    in_container api pnpm lint
}

fast_web() {
  require_container web
  # Os tipos globais das rotas (`PageProps`, `LayoutProps`) são gerados pelo Next.js. Num clone
  # novo, sem `pnpm dev` nem `pnpm build` rodados, eles não existem e o tsc acusa erro falso.
  step "Web: tipos de rota" \
    "rode \`docker compose -f compose.dev.yaml exec web pnpm exec next typegen\` e leia o erro." \
    in_container web pnpm exec next typegen
  step "Web: tipos" \
    "corrija os erros apontados e rode \`docker compose -f compose.dev.yaml exec web pnpm exec tsc --noEmit\`." \
    in_container web pnpm exec tsc --noEmit
  step "Web: lint" \
    "corrija os problemas apontados e rode \`docker compose -f compose.dev.yaml exec web pnpm lint\`." \
    in_container web pnpm lint
}

# api_suite <nome> <script do pnpm> <arquivo do relatório>
api_suite() {
  local name="$1" script="$2" report="$3"
  step "API: suíte $name" \
    "rode \`docker compose -f compose.dev.yaml exec api pnpm $script\`, leia a falha e corrija o código ou o teste." \
    in_container api pnpm "$script" --reporter=default --reporter=json "--outputFile.json=$report"
  step "API: relatório da suíte $name" \
    "a suíte tem de rodar ao menos um teste e não pode ter teste pulado: tire o \`.skip\`, o \`.only\` ou o \`.todo\`." \
    check_report api vitest "$report"
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

# A suíte no navegador fala com a web e a API reais, em modo de desenvolvimento.
ensure_apps() {
  local start="$1"
  if responds api http://127.0.0.1:3000/v1 && responds web http://127.0.0.1:3000/; then
    return 0
  fi
  if [[ "$start" != yes ]]; then
    abort "a web ou a API não está respondendo, e a suíte no navegador depende das duas." \
      "suba \`pnpm start:dev\` no contêiner \`api\` e \`pnpm dev --hostname 0.0.0.0\` no \`web\`, cada um num terminal, e rode de novo."
  fi
  "${COMPOSE[@]}" exec -d api sh -c 'pnpm start:dev >/tmp/api.log 2>&1'
  "${COMPOSE[@]}" exec -d web sh -c 'pnpm dev --hostname 0.0.0.0 >/tmp/web.log 2>&1'
  if ! wait_for api http://127.0.0.1:3000/v1 || ! wait_for web http://127.0.0.1:3000/; then
    in_container api cat /tmp/api.log >&2
    in_container web cat /tmp/web.log >&2
    abort "a web ou a API não respondeu em três minutos." \
      "leia os logs acima; o erro de subida está neles."
  fi
}

# Confere a tabela de aceite do pull request contra os relatórios das quatro suítes.
# A tabela só é exigida quando a branch altera código em apps/.
acceptance() {
  local mode=--optional
  [[ -n "$(git diff --name-only "$BASE_REF...HEAD" -- apps/)" ]] && mode=--required

  # O conferidor roda no contêiner `api`, que só enxerga a própria pasta. O corpo do PR e o
  # relatório da web chegam a ele pela entrada padrão, sem depender da permissão da pasta.
  in_container api sh -c 'mkdir -p reports && cat >reports/pr-body.md' <"$ACCEPTANCE_BODY_FILE" || return 1
  in_container web cat reports/playwright.json |
    in_container api sh -c 'cat >reports/playwright.json' || return 1

  in_container api node - "$mode" reports/pr-body.md \
    apps/api=vitest:reports/unit.json \
    apps/api=vitest:reports/int.json \
    apps/api=vitest:reports/e2e.json \
    apps/web/e2e=playwright:reports/playwright.json <scripts/check-acceptance.cjs
}

secret_scan() {
  git rev-parse --verify --quiet "$BASE_REF" >/dev/null ||
    abort "a referência \`$BASE_REF\` não existe neste clone." \
      "rode \`git fetch origin\`, ou aponte outra base com a variável HARNESS_BASE_REF."
  docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/repo" "$GITLEAKS_IMAGE" \
    git /repo --no-banner --redact --log-opts="$BASE_REF..HEAD"
}

run_full() {
  local start_apps="$1"
  require_container api
  require_container web
  require_container playwright

  # Relatório antigo não vale como evidência desta execução.
  in_container api rm -rf reports
  in_container web rm -rf reports

  fast_api
  fast_web

  api_suite "de unidade" test reports/unit.json
  api_suite "de integração" test:int reports/int.json
  api_suite "de ponta a ponta" test:e2e reports/e2e.json

  step "Web: build" \
    "rode \`docker compose -f compose.dev.yaml exec web pnpm build\` e corrija o erro de pré-renderização ou de compilação." \
    in_container web pnpm build

  ensure_apps "$start_apps"
  step "Web: suíte no navegador" \
    "rode \`docker compose -f compose.dev.yaml exec playwright npx playwright test\` e abra o trace em apps/web/test-results/." \
    "${COMPOSE[@]}" exec -T -e "CI=${CI:-}" playwright npx playwright test
  step "Web: relatório da suíte no navegador" \
    "a suíte tem de rodar ao menos um teste e não pode ter teste pulado: tire o \`.skip\`, o \`.only\` ou o \`.fixme\`." \
    check_report web playwright reports/playwright.json

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

case "$mode" in
  fast)
    projects=("$@")
    [[ ${#projects[@]} -eq 0 ]] && projects=(api web)
    for project in "${projects[@]}"; do
      case "$project" in
        api) fast_api ;;
        web) fast_web ;;
        *) usage ;;
      esac
    done
    ;;
  full)
    start_apps=no
    for arg in "$@"; do
      case "$arg" in
        --start-apps) start_apps=yes ;;
        *) usage ;;
      esac
    done
    run_full "$start_apps"
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

printf '\nAPROVADO (%s).\n' "$mode"
