# Grupo de verificação da web. Quem chama estas funções é o scripts/verify.sh, que define os
# auxiliares (`step`, `in_container`, `require_container`, `check_report`, `responds`,
# `wait_for`, `abort`). O desenho está no docs/harness.md.

# Relatórios que o aceite confere, no formato
# <vitest|playwright>:<relatório, na pasta do projeto>
web_reports=(
  vitest:reports/unit.json
  playwright:reports/playwright.json
)

# Onde a API e a web respondem, cada uma dentro do próprio contêiner.
API_URL=http://127.0.0.1:3000/v1
WEB_URL=http://127.0.0.1:3000/

web_fast() {
  require_container web
  # Os tipos globais das rotas (`PageProps`, `LayoutProps`) são gerados pelo Next.js. Num clone
  # novo, sem `pnpm dev` nem `pnpm build` rodados, eles não existem e o tsc acusa erro falso.
  step "Web: tipos de rota" \
    "rode \`$EXEC web pnpm exec next typegen\` e leia o erro." \
    in_container web pnpm exec next typegen
  step "Web: tipos" \
    "corrija os erros apontados e rode \`$EXEC web pnpm exec tsc --noEmit\`." \
    in_container web pnpm exec tsc --noEmit
  step "Web: lint" \
    "corrija os problemas apontados e rode \`$EXEC web pnpm lint\`." \
    in_container web pnpm lint
}

web_full() {
  require_container playwright
  web_fast
  # Relatório antigo não vale como evidência desta execução.
  in_container web rm -rf reports
  step "Web: suíte de unidade" \
    "rode \`$EXEC web pnpm test\`, leia a falha e corrija o código ou o teste." \
    in_container web pnpm test --reporter=default --reporter=json "--outputFile.json=reports/unit.json"
  step "Web: relatório da suíte de unidade" \
    "a suíte tem de rodar ao menos um teste e não pode ter teste pulado: tire o \`.skip\`, o \`.only\` ou o \`.todo\`." \
    check_report web vitest reports/unit.json
  step "Web: build" \
    "rode \`$EXEC web pnpm build\` e corrija o erro de pré-renderização ou de compilação." \
    in_container web pnpm build
  web_ensure_apps
  step "Web: suíte no navegador" \
    "rode \`$EXEC playwright npx playwright test\` e abra o trace em apps/web/test-results/." \
    "${COMPOSE[@]}" exec -T -e "CI=${CI:-}" playwright npx playwright test
  step "Web: relatório da suíte no navegador" \
    "a suíte tem de rodar ao menos um teste e não pode ter teste pulado: tire o \`.skip\`, o \`.only\` ou o \`.fixme\`." \
    check_report web playwright reports/playwright.json
}

# A suíte no navegador fala com a web e a API reais, em modo de desenvolvimento. Com
# `--start-apps`, usado pela CI, as duas são subidas aqui.
web_ensure_apps() {
  if responds api "$API_URL" && responds web "$WEB_URL"; then
    return 0
  fi
  if [[ "$START_APPS" != yes ]]; then
    abort "a web ou a API não está respondendo, e a suíte no navegador depende das duas." \
      "suba \`pnpm start:dev\` no contêiner \`api\` e \`pnpm dev --hostname 0.0.0.0\` no \`web\`, cada um num terminal, e rode de novo."
  fi
  "${COMPOSE[@]}" exec -d api sh -c 'pnpm start:dev >/tmp/api.log 2>&1'
  "${COMPOSE[@]}" exec -d web sh -c 'pnpm dev --hostname 0.0.0.0 >/tmp/web.log 2>&1'
  if ! wait_for api "$API_URL" || ! wait_for web "$WEB_URL"; then
    in_container api cat /tmp/api.log >&2
    in_container web cat /tmp/web.log >&2
    abort "a web ou a API não respondeu em três minutos." \
      "leia os logs acima; o erro de subida está neles."
  fi
}
