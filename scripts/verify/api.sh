# Grupo de verificação da API. Quem chama estas funções é o scripts/verify.sh, que define os
# auxiliares (`step`, `in_container`, `require_container`, `check_report`). O desenho está no
# docs/harness.md.

# Relatórios que o aceite confere, no formato
# <vitest|playwright>:<relatório, na pasta do projeto>
api_reports=(
  vitest:reports/unit.json
  vitest:reports/int.json
  vitest:reports/e2e.json
)

api_fast() {
  require_container api
  step "API: tipos" \
    "corrija os erros apontados e rode \`$EXEC api pnpm exec tsc --noEmit\`." \
    in_container api pnpm exec tsc --noEmit
  step "API: lint" \
    "corrija os problemas apontados e rode \`$EXEC api pnpm lint\`." \
    in_container api pnpm lint
}

api_full() {
  api_fast
  # Relatório antigo não vale como evidência desta execução.
  in_container api rm -rf reports
  api_suite "de unidade" test reports/unit.json
  api_suite "de integração" test:int reports/int.json
  api_suite "de ponta a ponta" test:e2e reports/e2e.json
}

# api_suite <nome> <script do pnpm> <arquivo do relatório>
api_suite() {
  local name="$1" script="$2" report="$3"
  step "API: suíte $name" \
    "rode \`$EXEC api pnpm $script\`, leia a falha e corrija o código ou o teste." \
    in_container api pnpm "$script" --reporter=default --reporter=json "--outputFile.json=$report"
  step "API: relatório da suíte $name" \
    "a suíte tem de rodar ao menos um teste e não pode ter teste pulado: tire o \`.skip\`, o \`.only\` ou o \`.todo\`." \
    check_report api vitest "$report"
}
