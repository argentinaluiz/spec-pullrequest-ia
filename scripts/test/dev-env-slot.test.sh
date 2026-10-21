#!/usr/bin/env bash
#
# Testes do ambiente de desenvolvimento por slot (compose.dev.yaml), pela configuração que o Compose
# resolve, sem subir contêiner: o `.env` do slot move as portas e os endereços, sem ele o ambiente é o
# de hoje, e a máscara do `.git` serve para um `.git` que é pasta e para um que é arquivo. O contrato do
# `.env` (os nomes das variáveis e a fórmula das portas) é o do docs/lld.md, seção 6, "Ambiente local por
# slot". Rodam na máquina, porque usam o `docker compose`. Quem chama é o .claude/skills/verificar/scripts/verify.sh.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=../.claude/skills/verificar/scripts/test/sh-helpers.sh
source "$ROOT/.claude/skills/verificar/scripts/test/sh-helpers.sh"

for tool in docker jq git; do
  command -v "$tool" >/dev/null || { echo "Falta o \`$tool\` na máquina: o teste do ambiente por slot precisa dele."; exit 2; }
done

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# O `.env` do slot 1, como o contrato da LLD o descreve, para o worktree: as portas de hoje mais 10, os
# três endereços que a API e o `playwright` leem e a máscara do `.git` por arquivo.
cat >"$work/slot1.env" <<'ENV'
SLOT=1
WEB_PORT=3010
API_PORT=3011
STORAGE_PORT=4453
MAILPIT_PORT=8035
WEB_ORIGIN=http://localhost:3010
STORAGE_PUBLIC_URL=http://localhost:4453
STORAGE_EMULATOR_HOST=http://storage:4453
GIT_MASK_TYPE=bind
GIT_MASK_SOURCE=/dev/null
ENV
# Sem `.env`: um arquivo vazio, passado de forma explícita, para um `.env` do checkout de quem roda não
# entrar no resultado.
: >"$work/slot0.env"

# As duas configurações resolvidas, em JSON, uma vez para todos os casos.
for slot in slot0 slot1; do
  (cd "$ROOT" && docker compose -f compose.dev.yaml --env-file "$work/$slot.env" config --format json) >"$work/$slot.json" ||
    { echo "O Compose não resolveu a configuração do $slot."; exit 2; }
done

# has <slot> <filtro do jq>: a configuração resolvida do slot satisfaz o filtro.
has() {
  jq -e "$2" "$work/$1.json" >/dev/null
}

# expect_ports <slot> <web> <api> <storage> <e-mails>: as portas publicadas, e o storage escutando e se
# anunciando na dele, com o healthcheck na mesma.
expect_ports() {
  local slot="$1" web="$2" api="$3" storage="$4" mailpit="$5"
  has "$slot" "[.services.web.ports[] | [.published, .target]] == [[\"$web\", 3000]]" &&
    has "$slot" "[.services.api.ports[] | [.published, .target]] == [[\"$api\", 3000]]" &&
    has "$slot" "[.services.storage.ports[] | [.published, .target]] == [[\"$storage\", $storage]]" &&
    has "$slot" "[.services.mailpit.ports[] | [.published, .target]] == [[\"$mailpit\", 8025]]" &&
    has "$slot" ".services.storage.entrypoint[-1] | contains(\"-port $storage \") and endswith(\"-public-host localhost:$storage\")" &&
    has "$slot" ".services.storage.healthcheck.test[-1] | contains(\"127.0.0.1:$storage/\")"
}

# --- CA1: o `.env` do slot 1 move as portas e os endereços ---
ca1() {
  expect_ports slot1 3010 3011 4453 8035 &&
    has slot1 '.services.api.environment | .WEB_ORIGIN == "http://localhost:3010" and .STORAGE_PUBLIC_URL == "http://localhost:4453" and .STORAGE_EMULATOR_HOST == "http://storage:4453"' &&
    has slot1 '.services.playwright.environment.STORAGE_PUBLIC_URL == "http://localhost:4453"' &&
    # Os endereços entre contêineres que não são do storage seguem como hoje.
    has slot1 '.services.web.environment.API_URL == "http://api:3000" and .services.playwright.environment.WEB_URL == "http://web:3000" and .services.playwright.environment.MAILPIT_URL == "http://mailpit:8025" and .services.playwright.environment.API_URL == "http://api:3000" and .services.playwright.environment.DATABASE_URL == "postgresql://app:app@postgres:5432/app"'
}
check "o .env do slot 1 move as portas e os endereços do ambiente @LUI-184-CA1 @LUI-197-CA4" ca1

# --- CA2: sem `.env`, o ambiente é o de hoje ---
ca2() {
  expect_ports slot0 3000 3001 4443 8025 &&
    # Uma variável sem valor e sem `.env` sai nula: o Compose não a passa ao contêiner.
    has slot0 '[.services.api.environment.WEB_ORIGIN, .services.api.environment.STORAGE_PUBLIC_URL, .services.api.environment.STORAGE_EMULATOR_HOST, .services.playwright.environment.STORAGE_PUBLIC_URL] | all(. == null)' &&
    has slot0 '[.services.api.volumes[] | select(.target == "/repo/.git") | [.type, .read_only]] == [["tmpfs", true]]'
}
check "sem .env, a configuração do ambiente é a de hoje @LUI-184-CA2 @LUI-197-CA4" ca2

# --- CA3: a máscara do `.git` serve para o `.git` que é pasta e para o que é arquivo ---

# A imagem do storage, a menor das do ambiente e que o `up` já baixou: o teste só precisa de um `sh`.
IMAGE="$(jq -r '.services.storage.image' "$work/slot0.json")"
docker image inspect "$IMAGE" >/dev/null 2>&1 || {
  echo "Falta a imagem $IMAGE na máquina: suba o ambiente com \`docker compose -f compose.dev.yaml up -d --wait\` e rode de novo."
  exit 2
}

# in_container <pasta> <slot da máscara>: roda num contêiner que tem a pasta em /repo, só para leitura como
# no contêiner da API, coberta pela máscara que a configuração do slot declara para o `.git` (o tipo, a
# origem se há, e somente leitura). Confere que ele não vê nem o histórico (o HEAD de um `.git` que é pasta)
# nem o ponteiro do worktree (o `gitdir:` de um `.git` que é arquivo).
in_container() {
  local mask
  mask="$(jq -r '.services.api.volumes[] | select(.target == "/repo/.git")
    | "type=\(.type),target=\(.target),readonly" + (if .source then ",source=\(.source)" else "" end)' "$work/$2.json")"
  docker run --rm --pull=never --entrypoint sh \
    --mount "type=bind,source=$1,target=/repo,readonly" --mount "$mask" \
    "$IMAGE" -c '[ ! -e /repo/.git/HEAD ] && ! grep -q gitdir /repo/.git 2>/dev/null' >/dev/null 2>&1
}

ca3() {
  local repo="$work/repo" worktree="$work/worktree"
  git init -q "$repo" &&
    git -C "$repo" -c user.name=t -c user.email=t@t commit -q --allow-empty -m inicial &&
    git -C "$repo" worktree add -q --detach "$worktree" &&
    # Pasta: a máscara padrão, a do checkout principal e da CI.
    in_container "$repo" slot0 &&
    # Arquivo: a máscara do `.env` de um worktree.
    in_container "$worktree" slot1 &&
    # Controle: a máscara padrão não sobe sobre um `.git` que é arquivo, o defeito que o ticket corrige.
    ! in_container "$worktree" slot0
}
check "a máscara do .git serve para o .git que é pasta e para o que é arquivo @LUI-184-CA3 @LUI-197-CA4" ca3

finish "do ambiente de desenvolvimento por slot"
