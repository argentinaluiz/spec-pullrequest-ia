#!/usr/bin/env bash
#
# O desvio do plano: se o contrato ou o schema de um ponto é diferente do que está no commit de plano, mostra a visão entre os
# dois, acrescenta-a ao arquivo do desvio e avisa no pull request. É o `contrato.desvio` do `.config/project`, que a revisão de conformidade chama,
# e o aviso do modo completo da verificação. Só avisa: nunca bloqueia.
#
#   contract-drift.sh <commit de plano> <para, ou vazio> <arquivo do desvio>
#
# Entrada: o commit de plano; o ponto com que comparar (um commit; vazio é a pasta de trabalho); e o arquivo do desvio, que é
# onde a visão é acrescentada (a pasta dele é criada; o caminho é relativo à raiz do repositório, para onde o comando vai). O contrato é comparado como na conferência do snapshot gerado, então um
# snapshot regenerado que só muda descrições, resumos, exemplos ou a ordem das chaves não é desvio.
# Saída (a padrão): sem desvio, uma frase que diz que o contrato e o schema estão iguais ao planejado, e o arquivo não é
# tocado; com desvio, a visão (a mesma do arquivo) e uma anotação `::warning title=Contrato diferente do planejado::...`; e,
# se a visão não pôde ser montada, o erro dela no lugar do desvio, também no arquivo, com a anotação. Precisa do `docker`
# (o oasdiff) e, para a visão, do contêiner `api` no ar. Roda de qualquer pasta: vai para a raiz do repositório.
#
# Sai com 0, com ou sem desvio e mesmo quando a visão não pôde ser montada, e com 2 no uso errado.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 2
# shellcheck source=contract-lib.sh
source scripts/contract-lib.sh

if [[ $# -ne 3 || -z "$1" || -z "$3" ]]; then
  echo 'Uso: contract-drift.sh <commit de plano> <para, ou vazio> <arquivo do desvio>' >&2
  exit 2
fi
plan="$1" to="$2" drift="$3"

short="$(git rev-parse --short "$plan")" || exit 2
refs=("$plan")
if [[ -n "$to" ]]; then
  refs+=("$to")
  to="$(git rev-parse --short "$to")" || exit 2
fi

contract=igual
schema=igual
dir="$(mktemp -d)" || exit 2
contract_snapshot_at "$plan" >"$dir/plano.json"
contract_snapshot_at "$to" >"$dir/comparado.json"
# Um snapshot ilegível também sai diferente de zero: conta como desvio, e a visão diz o erro.
contract_openapi_same "$dir" plano.json comparado.json >/dev/null 2>&1 || contract=diferente
rm -rf "$dir"
git diff --quiet "${refs[@]}" -- "$API_SCHEMA" || schema=diferente

if [[ "$contract" == igual && "$schema" == igual ]]; then
  echo "O contrato e o schema estão iguais ao planejado no commit de plano $short."
  exit 0
fi

if view="$(contract_view "$short" "$to" 2>&1)"; then
  warning="O contrato da OpenAPI ou o schema do Prisma mudou depois do commit de plano $short. Confira se o desvio é pedido pelo ticket; a visão está no log, e na máquina em $drift."
else
  view="A visão do desvio em relação ao commit de plano $short não pôde ser montada. O que segue é o erro dela, e não o desvio."$'\n\n'"$view"
  warning="O contrato ou o schema mudou depois do commit de plano $short, mas a visão do desvio não pôde ser montada (ver o log, ou $drift)."
fi
mkdir -p "$(dirname "$drift")"
printf '%s\n' "$view" | tee -a "$drift"
echo "::warning title=Contrato diferente do planejado::$warning"
exit 0
