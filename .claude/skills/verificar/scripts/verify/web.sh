# Grupo de verificação da web. Quem chama estas funções é o .claude/skills/verificar/scripts/verify.sh, que define os
# auxiliares (`step`, `in_container`, `require_container`, `check_report`, `responds`,
# `wait_for`, `abort`, `fail`).

# Relatórios que o aceite confere, no formato
# <vitest|playwright>:<relatório, na pasta do projeto>
web_reports=(
  vitest:reports/unit.json
  playwright:reports/playwright.json
)

# Onde a API e a web respondem, cada uma dentro do próprio contêiner.
API_URL=http://127.0.0.1:3000/v1
WEB_URL=http://127.0.0.1:3000/
# O build de produção da web, servido pelo `next start` só durante a suíte no navegador, numa porta
# à parte da do servidor de desenvolvimento: no contêiner `web` e no endereço que o `playwright` abre.
WEB_BUILD_PORT=3100
WEB_BUILD_LOCAL_URL="http://127.0.0.1:$WEB_BUILD_PORT/"
WEB_BUILD_URL="http://web:$WEB_BUILD_PORT"
# O PID do `next start`, que é também o do grupo de processos dele, e o log, no contêiner `web`.
WEB_BUILD_PID=/tmp/web-build.pid
WEB_BUILD_LOG=/tmp/web-build.log
# A variável que marca o processo do `next start` desta verificação, no ambiente dele. O
# `web_stop_build` a confere antes de encerrar o PID gravado, porque o título que o Next.js dá ao
# processo (`next-server`) apaga da linha de comando o `start` e a porta.
WEB_BUILD_MARK="VERIFY_WEB_BUILD_PORT=$WEB_BUILD_PORT"

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
  # A suíte no navegador roda contra o build compilado aqui (os dois projetos do
  # playwright.config.ts, descritos no apps/web/AGENTS.md). Sem build, ela não roda, e só o passo do
  # build falha.
  step "Web: build" \
    "rode \`$EXEC web pnpm build\` e corrija o erro de pré-renderização ou de compilação." \
    in_container web pnpm build || return
  web_ensure_apps
  web_browser_suite
}

# A suíte no navegador com o build de produção no ar. Esta função é a dona do `next start`: o sobe,
# roda a suíte e é o único ponto que o tira do ar, passe ou falhe a suíte ou a subida. Antes de subir,
# derruba o que uma verificação interrompida tenha deixado na porta.
web_browser_suite() {
  web_stop_build
  if step "Web: build no ar" \
    "leia o log do \`next start\` acima; se a porta $WEB_BUILD_PORT já responde, pare o servidor que está nela e rode de novo." \
    web_serve_build; then
    step "Web: suíte no navegador" \
      "rode \`$EXEC -e WEB_BUILD_URL=$WEB_BUILD_URL playwright npx playwright test\` com o build servido na porta $WEB_BUILD_PORT, e pare o servidor depois, porque a verificação recusa a porta ocupada (ou rode sem a variável, tudo contra o servidor de desenvolvimento); abra o trace em apps/web/test-results/." \
      "${COMPOSE[@]}" exec -T -e "CI=${CI:-}" -e "WEB_BUILD_URL=$WEB_BUILD_URL" playwright npx playwright test
    step "Web: relatório da suíte no navegador" \
      "a suíte tem de rodar ao menos um teste e não pode ter teste pulado: tire o \`.skip\`, o \`.only\` ou o \`.fixme\`." \
      check_report web playwright reports/playwright.json
  fi
  web_stop_build
}

# Serve o build com o `next start` e espera ele responder. Ele roda numa sessão própria (`setsid`),
# com o PID dela gravado, para o `web_stop_build` encerrar o grupo de processos inteiro, e com a marca
# no ambiente. Um servidor que já responda na porta não é reaproveitado: ele não é o build desta
# verificação, e a suíte passaria contra outro código.
web_serve_build() {
  if responds web "$WEB_BUILD_LOCAL_URL"; then
    fail "A porta $WEB_BUILD_PORT já responde: pare o servidor que está nela." \
      "a verificação sobe o próprio build nessa porta e não usa um servidor que já esteja nela; pare-o no contêiner \`web\` e rode de novo."
    return
  fi
  start_in web "$WEB_BUILD_LOG" \
    "setsid sh -c 'echo \$\$ >$WEB_BUILD_PID; export $WEB_BUILD_MARK; exec ./node_modules/.bin/next start --hostname 0.0.0.0 --port $WEB_BUILD_PORT'"
  wait_or_log web "$WEB_BUILD_LOCAL_URL" "$WEB_BUILD_LOG" "$WEB_BUILD_PID" ||
    fail "O build de produção não respondeu na porta $WEB_BUILD_PORT: o \`next start\` parou ou passou dos três minutos." \
      "leia o log do \`next start\` acima; o erro de subida está nele."
}

# Tira o build do ar, se ele está rodando. Só encerra o PID gravado se ele ainda é o `next start` desta
# verificação (o Next.js na linha de comando e a marca no ambiente), para não derrubar outro processo
# que tenha herdado o número. Encerra o grupo de processos e espera o processo sair, por até dez
# segundos; depois disso, o mata.
web_stop_build() {
  in_container web sh -c "
    pid=\$(cat $WEB_BUILD_PID 2>/dev/null) || exit 0
    rm -f $WEB_BUILD_PID
    case \"\$pid\" in '' | *[!0-9]*) exit 0 ;; esac
    tr '\\0' ' ' </proc/\$pid/cmdline 2>/dev/null | grep -q next || exit 0
    tr '\\0' '\\n' </proc/\$pid/environ 2>/dev/null | grep -qx '$WEB_BUILD_MARK' || exit 0
    kill -TERM -\$pid 2>/dev/null
    tries=0
    while kill -0 \$pid 2>/dev/null && [ \$tries -lt 20 ]; do
      sleep 0.5
      tries=\$((tries + 1))
    done
    kill -KILL -\$pid 2>/dev/null
    exit 0" ||
    true
}

# Sobe um comando em segundo plano no contêiner, com a saída num log.
# start_in <serviço> <log> <comando>
start_in() {
  "${COMPOSE[@]}" exec -d "$1" sh -c "$3 >$2 2>&1"
}

# Espera o endereço responder no contêiner; se ele não responde, ou se o processo do arquivo de PID
# dado parou antes, mostra o log e falha.
# wait_or_log <serviço> <endereço> <log> [arquivo de PID]
wait_or_log() {
  wait_for "$1" "$2" "${4:-}" && return 0
  in_container "$1" cat "$3" >&2
  return 1
}

# A suíte no navegador fala com a API real e com o servidor de desenvolvimento da web, que serve a
# vitrine. Com `--start-apps`, usado pela CI, os dois são subidos aqui.
web_ensure_apps() {
  if responds api "$API_URL" && responds web "$WEB_URL"; then
    return 0
  fi
  if [[ "$START_APPS" != yes ]]; then
    abort "o servidor de desenvolvimento da web ou a API não está respondendo, e a suíte no navegador depende dos dois." \
      "suba \`pnpm start:dev\` no contêiner \`api\` e \`pnpm dev --hostname 0.0.0.0\` no \`web\`, cada um num terminal, e rode de novo."
  fi
  start_in api /tmp/api.log 'pnpm start:dev'
  start_in web /tmp/web.log 'pnpm dev --hostname 0.0.0.0'
  wait_or_log api "$API_URL" /tmp/api.log && wait_or_log web "$WEB_URL" /tmp/web.log ||
    abort "a web ou a API não respondeu em três minutos." "leia o log acima; o erro de subida está nele."
}
