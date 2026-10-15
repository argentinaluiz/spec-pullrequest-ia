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
  api_contract
}

# Versão fixa, para o mesmo contrato dar sempre o mesmo resultado.
OASDIFF_IMAGE=tufin/oasdiff:v1.33.0

# O contrato (a OpenAPI gerada do código) e o schema do banco, conferidos por máquina. O
# snapshot versionado (apps/api/openapi.json) é o dono do contrato, e o schema do Prisma, o das
# tabelas implementadas. O desenho está no docs/harness.md, etapa 8.
api_contract() {
  step "API: contrato igual ao snapshot da OpenAPI" \
    "o código e apps/api/openapi.json divergem. Rode \`$EXEC api pnpm openapi:generate openapi.json\`, leia o diff e acerte o código ou o snapshot." \
    api_openapi_matches
  step "API: contrato sem quebra em relação à base" \
    "a mudança quebra o contrato da base. Se a quebra é intencional, o usuário decide: não contorne a conferência." \
    api_openapi_compatible
  step "API: schema com a migração correspondente" \
    "o schema do Prisma tem mudanças sem migração. Rode \`$EXEC api pnpm exec prisma migrate dev --name <nome>\`, ou desfaça a mudança no schema." \
    api_schema_has_migration
}

# Os dois snapshots descrevem o mesmo contrato. Descrições, resumos e exemplos não contam: texto de
# documentação não muda o contrato. Os caminhos são relativos à <pasta>, montada no contêiner.
# api_openapi_same <pasta> <snapshot> <outro snapshot>
api_openapi_same() {
  docker run --rm -v "$1:/work:ro" "$OASDIFF_IMAGE" diff "/work/$2" "/work/$3" \
    --fail-on-diff --exclude-elements description,examples,summary
}

# O contrato gerado do código tem de ser igual ao snapshot.
api_openapi_matches() {
  in_container api pnpm openapi:generate reports/openapi.json &&
    api_openapi_same "$PWD/apps/api" openapi.json reports/openapi.json
}

# O snapshot não pode quebrar o da base. Sem snapshot na base (a primeira adoção), não há o que comparar.
api_openapi_compatible() {
  local dir
  require_base
  if ! git cat-file -e "$BASE_REF:apps/api/openapi.json" 2>/dev/null; then
    echo "A base não tem apps/api/openapi.json: nada a comparar."
    return 0
  fi
  dir="$(mktemp -d)" || return 1
  local code=1
  if git show "$BASE_REF:apps/api/openapi.json" >"$dir/base.json"; then
    docker run --rm -v "$dir:/base:ro" -v "$PWD/apps/api:/work:ro" "$OASDIFF_IMAGE" breaking /base/base.json /work/openapi.json --fail-on ERR
    code=$?
  fi
  rm -rf "$dir"
  return $code
}

# O snapshot da OpenAPI e o schema do Prisma, que a visão do contrato e o desvio do plano comparam.
API_SNAPSHOT=apps/api/openapi.json
API_SCHEMA=apps/api/prisma/schema.prisma

# O snapshot num commit, ou na pasta de trabalho quando o commit é vazio. Sem snapshot, uma OpenAPI
# sem rotas, para a visão mostrar todas como novas.
# api_snapshot_at <commit, ou vazio>
api_snapshot_at() {
  if [[ -n "$1" ]]; then git show "$1:$API_SNAPSHOT" 2>/dev/null; else cat "$API_SNAPSHOT" 2>/dev/null; fi ||
    echo '{"openapi":"3.0.0","info":{"title":"vazio","version":"0"},"paths":{}}'
}

# A visão legível do contrato e do schema entre dois pontos: o changelog do oasdiff (o que mudou, com
# a severidade), o contrato completo de cada rota nova ou alterada, montado pelo
# scripts/contract-view.cjs no formato da seção 3 do LLD, e o diff do schema do Prisma. Sem <to>, o
# segundo ponto é a pasta de trabalho. Não é versionada. O desenho está no docs/harness.md, etapa 8.
# api_contract_view <from> [<to>]
api_contract_view() {
  local from="$1" to="${2:-}" dir code=0 schema_diff
  local refs=("$from")
  [[ -n "$to" ]] && refs+=("$to")
  dir="$(mktemp -d)" || return 1
  api_snapshot_at "$from" >"$dir/base.json"
  api_snapshot_at "$to" >"$dir/novo.json"

  printf 'Contrato e schema de %s para %s.\n' "$from" "${to:-a pasta de trabalho}"
  if cmp -s "$dir/base.json" "$dir/novo.json"; then
    printf '\n--- Contrato\n\nO snapshot da OpenAPI é o mesmo nos dois pontos: o contrato não muda.\n'
  else
    api_contract_routes "$dir" "$from" "$to" || code=1
  fi
  rm -rf "$dir"

  printf '\n--- Schema do Prisma (%s)\n\n' "$API_SCHEMA"
  schema_diff="$(git --no-pager diff --no-color "${refs[@]}" -- "$API_SCHEMA")" || code=1
  if [[ -n "$schema_diff" ]]; then
    printf '%s\n' "$schema_diff"
  else
    echo "O schema do Prisma não muda."
  fi
  return $code
}

# O changelog do oasdiff e o contrato completo das rotas novas ou alteradas, entre os dois snapshots
# que a visão gravou em <pasta>. Sem <para>, o segundo é o da pasta de trabalho.
# api_contract_routes <pasta> <de> [<para>]
api_contract_routes() {
  local dir="$1"
  printf '\n--- O que mudou no contrato (oasdiff changelog)\n\n'
  if ! docker run --rm -v "$dir:/contrato:ro" "$OASDIFF_IMAGE" changelog \
    /contrato/base.json /contrato/novo.json --color never --lang pt-br; then
    printf '\nUm dos snapshots da OpenAPI não é uma OpenAPI legível, e a visão não pôde ser montada.\n' >&2
    printf 'No erro do oasdiff acima, "base" é o %s em %s, e "revision", o %s.\n' \
      "$API_SNAPSHOT" "$2" "$([[ -n "${3:-}" ]] && echo "de $3" || echo "da pasta de trabalho")" >&2
    return 1
  fi

  # O renderizador roda no contêiner, que tem o Node e só enxerga a pasta da API: ele e os dois
  # snapshots chegam pela entrada padrão.
  printf '\n--- Contrato completo das rotas novas ou alteradas\n\n'
  tar -c -C scripts contract-view.cjs -C "$dir" base.json novo.json |
    in_container api sh -c 'rm -rf reports/contract-view && mkdir -p reports/contract-view && tar -x -C reports/contract-view && cd reports/contract-view && node contract-view.cjs base.json novo.json'
}

# O desvio do plano: se o contrato ou o schema de <para> é diferente do commit de plano, mostra a
# visão entre os dois, acrescenta-a ao DRIFT_FILE (do scripts/verify.sh) e avisa no PR. Sem <para>,
# compara com a pasta de trabalho. O contrato é comparado como no `api_openapi_matches`, então um
# snapshot regenerado que só muda descrições, resumos, exemplos ou a ordem das chaves não é desvio.
# Não bloqueia. O desenho está no docs/harness.md, etapa 8.
# api_contract_drift <commit de plano> [<para>]
api_contract_drift() {
  local plan="$1" to="${2:-}" short dir view warning contract=igual schema=igual
  local refs=("$plan")
  short="$(git rev-parse --short "$plan")"
  if [[ -n "$to" ]]; then
    refs+=("$to")
    to="$(git rev-parse --short "$to")"
  fi
  dir="$(mktemp -d)" || return 1
  api_snapshot_at "$plan" >"$dir/plano.json"
  api_snapshot_at "$to" >"$dir/comparado.json"
  # Um snapshot ilegível também sai diferente de zero: conta como desvio, e a visão diz o erro.
  api_openapi_same "$dir" plano.json comparado.json >/dev/null 2>&1 || contract=diferente
  rm -rf "$dir"
  git diff --quiet "${refs[@]}" -- "$API_SCHEMA" || schema=diferente

  if [[ "$contract" == igual && "$schema" == igual ]]; then
    echo "O contrato e o schema estão iguais ao planejado no commit de plano $short."
    return 0
  fi
  if view="$(api_contract_view "$short" "$to" 2>&1)"; then
    warning="O contrato da OpenAPI ou o schema do Prisma mudou depois do commit de plano $short. Confira se o desvio é pedido pelo ticket; a visão está no log, e na máquina em $DRIFT_FILE, que o revisor recebe."
  else
    view="A visão do desvio em relação ao commit de plano $short não pôde ser montada. O que segue é o erro dela, e não o desvio."$'\n\n'"$view"
    warning="O contrato ou o schema mudou depois do commit de plano $short, mas a visão do desvio não pôde ser montada (ver o log, ou $DRIFT_FILE)."
  fi
  mkdir -p "$(dirname "$DRIFT_FILE")"
  printf '%s\n' "$view" | tee -a "$DRIFT_FILE"
  echo "::warning title=Contrato diferente do planejado::$warning"
}

# Com as migrações aplicadas, o banco do ambiente tem de ficar igual ao schema do Prisma.
api_schema_has_migration() {
  in_container api sh -c 'pnpm exec prisma migrate deploy >/dev/null && pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code'
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
