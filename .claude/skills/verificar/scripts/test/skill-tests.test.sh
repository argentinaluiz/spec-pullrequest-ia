#!/usr/bin/env bash
#
# Testes da busca dos testes das skills (skill-tests.sh) e do uso dela pela verificação
# completa: numa árvore temporária com duas skills, cada uma com um teste ao lado do script ou do hook, a
# busca acha os dois sem lista à mão, e o executor dos testes em shell reprova pelo que falha e aprova sem
# ele. Rodam na máquina. Quem chama é o verify.sh.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../../../.." && pwd)"
FINDER="$ROOT/.claude/skills/verificar/scripts/verify/skill-tests.sh"
RUNNER="$ROOT/.claude/skills/verificar/scripts/test/shell-tests.sh"
# shellcheck source=../../../plan-ticket/scripts/test/helpers.sh
source "$ROOT/.claude/skills/plan-ticket/scripts/test/helpers.sh"

command -v jq >/dev/null || { echo "Falta o \`jq\` na máquina: o executor dos testes em shell precisa dele."; exit 2; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
skills="$tmp/skills"

# Duas skills com mecanismo: uma com um teste de script que passa, outra com um de hook que falha, e um
# teste em Node ao lado de um script. O texto de uma terceira skill não tem pasta de mecanismo.
mkdir -p "$skills/a/scripts/test" "$skills/b/hooks/test" "$skills/c" "$skills/d/scripts/test"
printf '#!/usr/bin/env bash\necho "ok: caso de a"\n' >"$skills/a/scripts/test/passa.test.sh"
printf '#!/usr/bin/env bash\necho "FALHOU: caso de b"\nexit 1\n' >"$skills/b/hooks/test/falha.test.sh"
echo 'test("d", () => {});' >"$skills/d/scripts/test/no.test.cjs"
echo texto >"$skills/c/SKILL.md"
# O que não é teste não entra: o auxiliar, um teste fora de scripts/ e hooks/ e um teste fundo demais.
echo 'x' >"$skills/a/scripts/test/helpers.sh"
mkdir -p "$skills/c/teste" "$skills/a/scripts/test/fundo"
echo 'x' >"$skills/c/teste/solto.test.sh"
echo 'x' >"$skills/a/scripts/test/fundo/dentro.test.sh"

equals() { [[ "$1" == "$2" ]]; }
is_empty() { [[ -z "$1" ]]; }
exits_with() { [[ "$1" -eq "$2" ]]; }
reports_failure() { jq -e '.numFailedTests >= 1' "$1" >/dev/null; }

found="$("$FINDER" sh "$skills")"
check "a busca acha os testes em shell de todas as skills, sem lista à mão @LUI-194-CA5" \
  equals "$found" "$skills/a/scripts/test/passa.test.sh"$'\n'"$skills/b/hooks/test/falha.test.sh"
check "a busca acha também os testes em Node das skills @LUI-194-CA5" \
  equals "$("$FINDER" cjs "$skills")" "$skills/d/scripts/test/no.test.cjs"
check "a busca lista as pastas de mecanismo, e não a de texto @LUI-194-CA5" \
  equals "$("$FINDER" dirs "$skills")" "$skills/a/scripts"$'\n'"$skills/b/hooks"$'\n'"$skills/d/scripts"
check "uma pasta de skills que não existe não acha nada @LUI-194-CA5" \
  is_empty "$("$FINDER" sh "$tmp/nao-existe")"
"$FINDER" xyz "$skills" >/dev/null 2>&1
check "o modo desconhecido sai com o código 2 @LUI-194-CA5" exits_with $? 2

# A pasta de scripts do projeto, dada como terceiro argumento: seus testes (em `test/`, ao lado dos scripts) entram na busca
# junto com os das skills, e ela entra na lista das pastas de mecanismo. Sem o argumento, a busca só olha as skills.
project="$tmp/zprojeto"
mkdir -p "$project/test/fundo" "$tmp/vazia/test"
printf '#!/usr/bin/env bash\necho "ok: caso do projeto"\n' >"$project/test/do-projeto.test.sh"
echo 'test("p", () => {});' >"$project/test/do-projeto.test.cjs"
echo 'x' >"$project/test/helpers.sh"
echo 'x' >"$project/test/fundo/dentro.test.sh"
echo 'x' >"$project/mecanismo.sh"
check "a busca acha também os testes em shell da pasta de scripts do projeto, quando ela é dada" \
  equals "$("$FINDER" sh "$skills" "$project")" "$skills/a/scripts/test/passa.test.sh"$'\n'"$skills/b/hooks/test/falha.test.sh"$'\n'"$project/test/do-projeto.test.sh"
check "a busca acha também os testes em Node da pasta de scripts do projeto" \
  equals "$("$FINDER" cjs "$skills" "$project")" "$skills/d/scripts/test/no.test.cjs"$'\n'"$project/test/do-projeto.test.cjs"
check "a pasta de scripts do projeto entra na lista das pastas de mecanismo, e a vazia ou que não existe não entra" \
  equals "$("$FINDER" dirs "$skills" "$project")" "$skills/a/scripts"$'\n'"$skills/b/hooks"$'\n'"$skills/d/scripts"$'\n'"$project"
check "a pasta de scripts do projeto sem arquivo ou que não existe não entra em nenhuma busca" \
  equals "$("$FINDER" dirs "$skills" "$tmp/vazia")$("$FINDER" sh "$tmp/nao-existe" "$tmp/nao-existe")" "$skills/a/scripts"$'\n'"$skills/b/hooks"$'\n'"$skills/d/scripts"

# O executor, com os testes que a busca achou: o que falha reprova, e sem ele aprova.
mapfile -t all <<<"$found"
"$RUNNER" "$tmp/reprovado.json" "${all[@]}" >/dev/null 2>&1
code=$?
check "um teste de skill que falha reprova a verificação @LUI-194-CA5" exits_with "$code" 1
check "o relatório da verificação que reprovou traz o caso que falhou @LUI-194-CA5" reports_failure "$tmp/reprovado.json"
"$RUNNER" "$tmp/aprovado.json" "$skills/a/scripts/test/passa.test.sh" >/dev/null 2>&1
check "sem o teste que falha, a verificação aprova @LUI-194-CA5" exits_with $? 0

uses_finder_in_both_groups() {
  grep -q 'skill-tests.sh cjs' "$ROOT/.claude/skills/verificar/scripts/verify.sh" && grep -q 'skill-tests.sh sh' "$ROOT/.claude/skills/verificar/scripts/verify.sh"
}
check "o full do projeto usa a busca nos testes em Node e nos em shell @LUI-194-CA5" uses_finder_in_both_groups

# A verificação dá a pasta de scripts do projeto à busca nas três chamadas (testes em shell, em Node e pastas vigiadas).
gives_the_project_folder() {
  [[ "$(grep -c 'skill-tests.sh \(sh\|cjs\|dirs\) .*"\$PROJECT_SCRIPTS"' "$ROOT/.claude/skills/verificar/scripts/verify.sh")" -ge 3 ]] &&
    grep -q '^PROJECT_SCRIPTS=scripts$' "$ROOT/.claude/skills/verificar/scripts/verify.sh"
}
check "o full do projeto dá a pasta de scripts da raiz à busca nos três usos" gives_the_project_folder

# A pasta de scripts da raiz de verdade tem mecanismo e testes, e a busca a acha: se ela for esvaziada ou renomeada, a verificação
# deixaria de vigiá-la e de rodar os testes dela em silêncio.
finds_the_real_root_scripts() {
  [[ "$("$FINDER" dirs "$ROOT/.claude/skills" "$ROOT/scripts")" == *"$ROOT/scripts"* ]] &&
    "$FINDER" sh "$ROOT/.claude/skills" "$ROOT/scripts" | grep -qF "$ROOT/scripts/test/node-in-api.test.sh"
}
check "a busca acha a pasta de scripts da raiz de verdade e os testes dela" finds_the_real_root_scripts

finish "da busca dos testes das skills"
