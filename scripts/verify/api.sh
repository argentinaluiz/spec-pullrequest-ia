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

# O contrato gerado do código tem de ser igual ao snapshot. Descrições, resumos e exemplos não
# contam: texto de documentação não muda o contrato.
api_openapi_matches() {
  in_container api pnpm openapi:generate reports/openapi.json &&
    docker run --rm -v "$PWD/apps/api:/work:ro" "$OASDIFF_IMAGE" diff /work/openapi.json /work/reports/openapi.json \
      --fail-on-diff --exclude-elements description,examples,summary
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
