#!/usr/bin/env bash
#
# Roda o Node no contêiner `api`, que o tem, sobre o repositório que o serviço monta só para leitura
# em /repo, sem o .git (compose.dev.yaml). É o comando do Node deste projeto para a skill de plano (o
# .config/project o declara em `node.comando`) e o do `node_in_api` do .claude/skills/verificar/scripts/verify.sh, que o
# usa para o conferidor e os testes do harness (o contract-view.sh o usa para o renderizador).
#
#   scripts/node-in-api.sh <argumentos do node>...
#
# É chamado da raiz do repositório, e o Node roda na raiz dele no contêiner, /repo: os argumentos
# vão como estão, e os caminhos relativos à raiz valem lá como aqui. Um caminho absoluto da máquina,
# ou de fora do repositório, não existe no contêiner. A entrada padrão vai ao Node, e é por ela que
# chega o que nasce na máquina e não está no repositório. O /repo não aceita escrita: o que o Node
# grava vai para /app, a pasta da API, por caminho absoluto.
#
# Sai com o código do Node, ou com 2 quando o contêiner não está no ar ou foi criado sem a montagem.

set -uo pipefail

if [[ $# -eq 0 ]]; then
  echo 'Uso: scripts/node-in-api.sh <argumentos do node>...' >&2
  exit 2
fi

COMPOSE=(docker compose -f "$(dirname "$0")/../compose.dev.yaml")
"${COMPOSE[@]}" exec -T -w /repo api node "$@"
code=$?
[[ $code -eq 0 ]] && exit 0

# Só quando falha: se o contêiner não está no ar, ou está sem a montagem do repositório (foi criado
# antes dela), diz o que fazer.
if ! "${COMPOSE[@]}" exec -T api true >/dev/null 2>&1 </dev/null; then
  printf '\nO contêiner `api` não está no ar, e o Node roda nele.\n' >&2
  printf 'Como corrigir: suba o ambiente com `docker compose -f compose.dev.yaml up -d --build --wait` e rode de novo.\n' >&2
  exit 2
fi
if ! "${COMPOSE[@]}" exec -T api test -d /repo >/dev/null 2>&1 </dev/null; then
  printf '\nO contêiner `api` está no ar sem o repositório montado em /repo, onde o Node roda.\n' >&2
  printf 'Como corrigir: recrie o serviço com `docker compose -f compose.dev.yaml up -d --wait api` e rode de novo.\n' >&2
  exit 2
fi
exit "$code"
