# As funções que a visão do contrato (contract-view.sh) e o desvio do plano (contract-drift.sh) dividem, e que o grupo da API
# da verificação também carrega, para conferir o contrato gerado do código. Quem carrega este arquivo com `source` roda da
# raiz do repositório e recebe as funções `contract_*`, os caminhos do contrato e a imagem do oasdiff. O contrato aqui é o da
# API: o snapshot da OpenAPI, que é o dono do contrato, e o schema do Prisma, o das tabelas implementadas.

# Versão fixa, para o mesmo contrato dar sempre o mesmo resultado.
OASDIFF_IMAGE=tufin/oasdiff:v1.33.0

# O snapshot da OpenAPI e o schema do Prisma, que a visão do contrato e o desvio do plano comparam.
API_SNAPSHOT=apps/api/openapi.json
API_SCHEMA=apps/api/prisma/schema.prisma

# O Node no contêiner, que roda o renderizador, e o renderizador: o comando do Node deste projeto é o `scripts/node-in-api.sh` da raiz.
CONTRACT_NODE=scripts/node-in-api.sh
CONTRACT_RENDERER=scripts/contract-view.cjs

# O `git diff` que se lê (`plain_diff`), o mesmo da página do plano, é da skill de plano.
# shellcheck source=../.claude/skills/plan-ticket/scripts/plan-git.sh
source "$(dirname "${BASH_SOURCE[0]}")/../.claude/skills/plan-ticket/scripts/plan-git.sh"

# Os dois snapshots descrevem o mesmo contrato. Descrições, resumos e exemplos não contam: texto de documentação não muda o
# contrato. Os caminhos são relativos à <pasta>, montada no contêiner.
# contract_openapi_same <pasta> <snapshot> <outro snapshot>
contract_openapi_same() {
  docker run --rm -v "$1:/work:ro" "$OASDIFF_IMAGE" diff "/work/$2" "/work/$3" \
    --fail-on-diff --exclude-elements description,examples,summary
}

# O snapshot num commit, ou na pasta de trabalho quando o commit é vazio. Sem snapshot, uma OpenAPI sem rotas, para a visão
# mostrar todas como novas.
# contract_snapshot_at <commit, ou vazio>
contract_snapshot_at() {
  if [[ -n "$1" ]]; then git show "$1:$API_SNAPSHOT" 2>/dev/null; else cat "$API_SNAPSHOT" 2>/dev/null; fi ||
    echo '{"openapi":"3.0.0","info":{"title":"vazio","version":"0"},"paths":{}}'
}

# O changelog do oasdiff entre os dois snapshots gravados em <pasta> (base.json e novo.json). Se um deles não é uma OpenAPI
# legível, sai com 1 e diz qual é qual no erro do oasdiff.
# contract_changelog <pasta> <de> [<para>]
contract_changelog() {
  local out
  if out="$(docker run --rm -v "$1:/contrato:ro" "$OASDIFF_IMAGE" changelog \
    /contrato/base.json /contrato/novo.json --color never --lang pt-br)"; then
    printf '%s\n' "$out"
    return 0
  fi
  [[ -n "$out" ]] && printf '%s\n' "$out" >&2
  printf '\nUm dos snapshots da OpenAPI não é uma OpenAPI legível, e a visão não pôde ser montada.\n' >&2
  printf 'No erro do oasdiff acima, "base" é o %s em %s, e "revision", o %s.\n' \
    "$API_SNAPSHOT" "$2" "$([[ -n "${3:-}" ]] && echo "de $3" || echo "da pasta de trabalho")" >&2
  return 1
}

# As fontes da visão do contrato entre dois pontos, gravadas em <pasta>: os dois snapshots (base.json e novo.json); o changelog
# do oasdiff (changelog.txt), só quando os snapshots diferem; e o diff do schema do Prisma (schema.diff). Os pontos são commits
# ou árvores do Git; sem <para>, o segundo é a pasta de trabalho. Sai com 1, com o erro, quando um snapshot é ilegível ou o
# diff do schema falha.
# contract_sources <de> <para, ou vazio> <pasta>
contract_sources() {
  local from="$1" to="$2" dir="$3"
  local refs=("$from")
  [[ -n "$to" ]] && refs+=("$to")
  contract_snapshot_at "$from" >"$dir/base.json"
  contract_snapshot_at "$to" >"$dir/novo.json"
  if ! cmp -s "$dir/base.json" "$dir/novo.json"; then
    contract_changelog "$dir" "$from" "$to" >"$dir/changelog.txt" || return 1
  fi
  plain_diff "${refs[@]}" -- "$API_SCHEMA" >"$dir/schema.diff" || {
    printf '\nO `git diff` do %s de %s para %s falhou, e a visão não pôde ser montada.\n' \
      "$API_SCHEMA" "$from" "${to:-a pasta de trabalho}" >&2
    return 1
  }
}

# As fontes gravadas em <pasta> pelo `contract_sources`, como o contract-view.cjs as lê da entrada padrão: um par nome e valor
# por arquivo que existe, cada parte terminada por um NUL, com o texto do arquivo como está.
# contract_pairs <pasta>
contract_pairs() {
  local pair file
  for pair in base:base.json novo:novo.json changelog:changelog.txt schemaDiff:schema.diff; do
    file="$1/${pair#*:}"
    [[ -f "$file" ]] || continue
    printf '%s\0' "${pair%%:*}" && cat "$file" && printf '\0' || return 1
  done
}

# A visão legível do contrato e do schema entre dois pontos (commits ou árvores), em Markdown: o changelog do oasdiff (o que
# mudou, com a severidade), o contrato completo de cada rota nova ou alterada e o diff do schema do Prisma, escritos pelo
# contract-view.cjs sobre as fontes do `contract_sources`, nas seções `# Contrato` e `# Schema` que a página do plano da skill
# lê. As fontes nascem aqui, numa pasta temporária fora do repositório, e chegam ao contêiner pela entrada padrão. A primeira
# linha, antes das seções, diz os dois pontos. Sem <to>, o segundo ponto é a pasta de trabalho. Não é versionada.
# contract_view <from> [<to>]
contract_view() {
  local from="$1" to="${2:-}" dir code=0
  dir="$(mktemp -d)" || return 1
  printf 'Contrato e schema de %s para %s.\n\n' "$from" "${to:-a pasta de trabalho}"
  contract_sources "$from" "$to" "$dir" &&
    contract_pairs "$dir" | "$CONTRACT_NODE" "$CONTRACT_RENDERER" - || code=1
  rm -rf "$dir"
  return $code
}
