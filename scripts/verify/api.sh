# Grupo de verificação da API. Quem chama estas funções é o verify.sh, que define os
# auxiliares (`step`, `in_container`, `node_in_api`, `require_container`, `check_report`). O contrato (o snapshot da OpenAPI e o
# schema do Prisma, a imagem do oasdiff e as funções que o comparam) é do scripts/contract-lib.sh, que este grupo carrega: a visão e o
# desvio do plano são comandos dela, e a verificação os chama de lá.

# shellcheck source=../contract-lib.sh
source scripts/contract-lib.sh

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
  step "API: ordem das migrações" \
    "renomeie a migração nova que a mensagem aponta para um nome posterior à mais recente da base, como ela explica." \
    api_migration_order
  # Relatório antigo não vale como evidência desta execução. A pasta do relatório dos testes do
  # harness (`HARNESS_REPORT`, no verify.sh), que o Node não cria, nasce vazia aqui. Quem a cria é
  # o contêiner, e os testes em shell do harness, que rodam na máquina, gravam nela: onde o usuário da
  # máquina não é o do contêiner (o runner da CI), ela abre para todos.
  in_container api sh -c "rm -rf reports && mkdir -p '$(dirname "$HARNESS_REPORT")' && chmod a+rwx reports '$(dirname "$HARNESS_REPORT")'"
  api_suite "de unidade" test reports/unit.json
  api_suite "de integração" test:int reports/int.json
  api_suite "de ponta a ponta" test:e2e reports/e2e.json
  api_contract
}

# O contrato (a OpenAPI gerada do código) e o schema do banco, conferidos por máquina. O
# snapshot versionado (apps/api/openapi.json) é o dono do contrato, e o schema do Prisma, o das
# tabelas implementadas.
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

# O contrato gerado do código tem de ser igual ao snapshot.
api_openapi_matches() {
  in_container api pnpm openapi:generate reports/openapi.json &&
    contract_openapi_same "$PWD/apps/api" openapi.json reports/openapi.json
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

# A pasta das migrações do Prisma, que aplica cada uma na ordem do nome.
API_MIGRATIONS=apps/api/prisma/migrations

# As migrações novas da branch (as da pasta de trabalho que a base, o BASE_REF, não tem) têm de vir
# depois da mais recente da base: uma branch paralela que entrou na base antes ficaria com a migração
# dela no meio do histórico. Compara os nomes das pastas, que é o que o Prisma ordena; a migração que a
# branch apaga não é deste passo. Roda na raiz do repositório.
api_migration_order() {
  local base current latest late name
  require_base
  # Uma pasta que a base não tem lista vazio e aprova; uma base que não se lê (a referência, um clone raso
  # sem os objetos) falha, e o passo não aprova no escuro.
  base="$(git ls-tree -d --name-only "$BASE_REF" "$API_MIGRATIONS/")" || {
    echo "Não deu para ler as migrações da base \`$BASE_REF\`, e a ordem delas não foi conferida. Rode \`git fetch\`, ou aponte outra base com HARNESS_BASE_REF." >&2
    return 1
  }
  base="$(sed 's#.*/##' <<<"$base" | LC_ALL=C sort)"
  current="$(ls -1p "$API_MIGRATIONS" 2>/dev/null | sed -n 's#/$##p' | LC_ALL=C sort)"
  latest="$(tail -n 1 <<<"$base")"
  late="$(LC_ALL=C comm -13 <(echo "$base") <(echo "$current") | LC_ALL=C awk -v latest="$latest" '$0 < latest')"
  [[ -z "$late" ]] && return 0

  while IFS= read -r name; do
    echo "A migração nova $name vem antes da mais recente da base ($BASE_REF), $latest. O Prisma aplica as migrações na ordem do nome, e esta ficaria no meio do histórico." >&2
  done <<<"$late"
  echo "Recrie-a com um nome posterior: renomeie a pasta com \`git mv $API_MIGRATIONS/<nome atual> $API_MIGRATIONS/<AAAAMMDDHHMMSS>_<nome>\`, com a data de agora (UTC), e recomece o banco local (\`docker compose -f compose.dev.yaml down -v\` e \`up -d --wait\`) para as migrações se aplicarem na ordem nova. Se o SQL já não serve depois de trazer a base para a branch, apague a pasta e rode \`$EXEC api pnpm exec prisma migrate dev --name <nome>\` no banco recomeçado." >&2
  return 1
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
