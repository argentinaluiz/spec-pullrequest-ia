#!/usr/bin/env bash
#
# Hook de fim de turno do Claude Code (evento Stop). Quando o agente tenta encerrar o turno com
# código alterado em apps/api ou apps/web, roda o modo rápido do scripts/verify.sh nos projetos
# alterados. Se falhar, devolve a saída ao agente, que continua o trabalho. O desenho está no
# docs/harness.md.
#
# Sai com 0 para deixar o turno encerrar e com 2 para bloquear. No 2, o que foi escrito na
# saída de erro volta para o agente.

set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0

# Depois de tantos bloqueios seguidos, o hook deixa o turno encerrar e avisa o usuário,
# para um erro que o agente não consegue corrigir não virar um laço sem fim.
MAX_BLOCKS=3
BASE_REF="${HARNESS_BASE_REF:-origin/main}"

# O hook recebe um JSON pela entrada padrão. Só o identificador da sessão interessa.
session="$(jq -r '.session_id // empty' 2>/dev/null || true)"
session="${session:-sem-sessao}"

state_dir="$(git rev-parse --git-dir)/harness"
mkdir -p "$state_dir"
blocks_file="$state_dir/stop-blocks-$session"

# "Alterado" é a diferença entre a base da branch e a pasta de trabalho, mais os arquivos novos.
# Assim, o código que o agente já commitou no mesmo turno também conta.
base="$(git merge-base HEAD "$BASE_REF" 2>/dev/null || git rev-parse HEAD)"

changed_files() {
  git diff --name-only "$base" -- "apps/$1"
  git ls-files --others --exclude-standard -- "apps/$1"
}

# Resumo do estado do projeto. Se ele é o mesmo da última verificação aprovada, não há o que
# verificar de novo, e um turno que só mexeu em documento não paga o custo.
fingerprint() {
  {
    git diff "$base" -- "apps/$1"
    git ls-files --others --exclude-standard -z -- "apps/$1" | xargs -0 -r sha256sum
  } | sha256sum | cut -d' ' -f1
}

projects=()
for project in api web; do
  [[ -z "$(changed_files "$project")" ]] && continue
  [[ "$(cat "$state_dir/fast-ok-$project" 2>/dev/null)" == "$(fingerprint "$project")" ]] && continue
  projects+=("$project")
done

if [[ ${#projects[@]} -eq 0 ]]; then
  rm -f "$blocks_file"
  exit 0
fi

output="$(scripts/verify.sh fast "${projects[@]}" 2>&1)"
status=$?

if [[ $status -eq 0 ]]; then
  for project in "${projects[@]}"; do
    fingerprint "$project" >"$state_dir/fast-ok-$project"
  done
  rm -f "$blocks_file"
  exit 0
fi

blocks=$(($(cat "$blocks_file" 2>/dev/null || echo 0) + 1))

if [[ $blocks -gt $MAX_BLOCKS ]]; then
  rm -f "$blocks_file"
  printf '{"systemMessage": "A verificação rápida (%s) continua falhando depois de %d tentativas de correção. O agente encerrou o turno sem resolver. Rode scripts/verify.sh fast para ver o erro."}\n' \
    "${projects[*]}" "$MAX_BLOCKS"
  exit 0
fi

echo "$blocks" >"$blocks_file"

{
  echo "O turno não pode encerrar: a verificação rápida de ${projects[*]} não passou (tentativa $blocks de $MAX_BLOCKS)."
  echo "Leia a saída abaixo, corrija a causa e só então encerre. Não contorne a verificação."
  echo
  # O fim da saída traz o resumo do que falhou e como corrigir.
  echo "$output" | tail -n 80
} >&2
exit 2
