#!/usr/bin/env bash
#
# Teste do aviso de desvio do contrato do modo completo (a função `contract_drift` do verify.sh): ele chama o comando do desvio
# do contrato da raiz, uma vez, e continua só avisando. O modo completo inteiro é pesado demais para o teste, então ele tira a
# função do verify.sh e a roda sozinha, com o que ela pede aos vizinhos trocado (a seção "Aceite" do corpo do PR e o commit de
# plano) e o comando do desvio trocado por um falso, que registra a chamada. O script dos insumos da revisão lê o mesmo comando
# do .config/project, e o teste dele (review-inputs.test.sh, da skill revisao-conformidade) o troca por um falso. Roda na máquina. O caso leva a tag do critério de aceite no nome.

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../../.." && pwd)"
# shellcheck source=../../../plan-ticket/scripts/test/helpers.sh
source "$HERE/../../../plan-ticket/scripts/test/helpers.sh"

VERIFY="$ROOT/.claude/skills/verificar/scripts/verify.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# A função do aviso, tirada do verify.sh do repositório.
sed -n '/^contract_drift() {$/,/^}$/p' "$VERIFY" >"$tmp/contract_drift.sh"
check "a função do aviso de desvio existe no verify.sh" test -s "$tmp/contract_drift.sh"

# O comando do desvio falso: registra os argumentos e sai com FAKE_EXIT, dizendo uma frase.
cat >"$tmp/drift" <<'FAKE'
#!/usr/bin/env bash
printf '%s|%s|%s\n' "$1" "$2" "$3" >>"$FAKE_LOG"
echo "disse: aviso do comando"
exit "${FAKE_EXIT:-0}"
FAKE
chmod +x "$tmp/drift"

# warn <HEAD_REF>: roda a função com os vizinhos trocados; deixa a saída em $out, o código em $code e o registro em $tmp/log.
warn() {
  : >"$tmp/log"
  out="$(
    export FAKE_LOG="$tmp/log" FAKE_EXIT
    BASE_REF=origin/main HEAD_REF="$1" CONTRACT_DRIFT="$tmp/drift"
    cited_acceptance() { echo docs/tickets/PROJ-1/PROJ-2/aceite.md; }
    plan_commit() { echo abc123; }
    # shellcheck disable=SC1091
    source "$tmp/contract_drift.sh"
    contract_drift
  )"
  code=$?
}

name="o aviso de desvio do modo completo usa o comando do /contrato e só avisa @LUI-197-CA3"

warn ""
check "$name: chama o comando uma vez, com o commit de plano, o HEAD_REF vazio e o arquivo do desvio da pasta do ticket" \
  test "$(cat "$tmp/log")" = 'abc123||docs/tickets/PROJ-1/PROJ-2/contract-drift.txt'
check "$name: deixa passar o que o comando disse" bash -c '[[ $1 == *"disse: aviso do comando"* ]]' _ "$out"
check "$name: devolve 0" test "$code" -eq 0

warn "$(git -C "$ROOT" rev-parse HEAD)"
check "$name: passa o HEAD_REF ao comando, para a CI comparar com o fim da branch" \
  bash -c '[[ "$(cat "$1")" == abc123\|*\|docs/tickets/PROJ-1/PROJ-2/contract-drift.txt && "$(cat "$1")" != abc123\|\|* ]]' _ "$tmp/log"

FAKE_EXIT=1 warn ""
check "$name: quando o comando falha, devolve 0 mesmo assim e diz que o desvio não foi conferido" \
  bash -c '[[ $1 -eq 0 && $2 == *"falhou, e o desvio não foi conferido"* ]]' _ "$code" "$out"

# Quem chama é o comando do contrato da raiz, e só ele: o verify.sh o lê da configuração, que aponta o da raiz, e as apps
# não têm mais a função.
check "$name: o verify.sh lê o comando do desvio do contrato da configuração, que aponta o da raiz" \
  bash -c 'grep -q "contrato.desvio" "$1" && [[ "$(git config --file "$2" --get contrato.desvio)" == scripts/contract-drift.sh ]]' \
  _ "$VERIFY" "$ROOT/.config/project"
check "$name: nenhuma app declara mais uma função de desvio" \
  bash -c '! grep -rq "_contract_drift" "$1"/verify.sh "$1"/verify/' _ "$ROOT/.claude/skills/verificar/scripts"

finish "do aviso de desvio do contrato"
