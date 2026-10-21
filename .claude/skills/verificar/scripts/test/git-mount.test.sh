#!/usr/bin/env bash
#
# Testes do git-mount.sh, que diz o que o contêiner da varredura de segredos precisa para ler o
# histórico do Git: nada num repositório (onde o `.git` é uma pasta, dentro da pasta montada), e o `.git`
# comum e o `GIT_DIR` num worktree (onde o `.git` é um arquivo que aponta para fora dela, com caminho
# relativo ou absoluto, conforme a configuração do Git de quem o criou). O Docker não entra: o teste confere
# os argumentos. Rodam na máquina, porque usam o `git`. Quem chama é o verify.sh.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../../../.." && pwd)"
# shellcheck source=../../../plan-ticket/scripts/test/helpers.sh
source "$ROOT/.claude/skills/plan-ticket/scripts/test/helpers.sh"
# shellcheck source=../git-mount.sh
source "$ROOT/.claude/skills/verificar/scripts/git-mount.sh"

command -v git >/dev/null || { echo "Falta o \`git\` na máquina: o teste precisa dele."; exit 2; }

# O caminho físico, sem links simbólicos: é o que o Git imprime.
work="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$work"' EXIT
repo="$work/repo"
git init -q "$repo"
git -C "$repo" -c user.name=t -c user.email=t@t commit -q --allow-empty -m inicial

# args_in <pasta>: os argumentos que a função dá para o checkout da pasta, um por linha.
args_in() {
  (cd "$1" && gitleaks_git_args)
}

# Os argumentos de um worktree irmão do repositório, que o Git gravou com o caminho relativo ou o absoluto.
expected_for_worktree() {
  printf '%s\n' --mount "type=bind,source=$repo/.git,target=$repo/.git,readonly" \
    -e "GIT_DIR=$repo/.git/worktrees/$1" -e GIT_WORK_TREE=/repo
}

check "num repositório, onde o .git é uma pasta, não pede nada" test -z "$(args_in "$repo")"

# O `.git` com caminho relativo só existe a partir do Git 2.48 (`worktree.useRelativePaths`): antes, o Git grava
# sempre o absoluto e o caso do relativo não tem como existir. O script de frentes aceita o Git a partir da 2.38.
git_found="$(git --version | sed -E 's/^git version ([0-9]+\.[0-9]+).*/\1/')"
if [[ "$(printf '%s\n%s\n' 2.48 "$git_found" | sort -V | head -n 1)" == 2.48 ]]; then
  git -C "$repo" -c worktree.useRelativePaths=true worktree add -q --detach "$work/relativo"
  check "o worktree está com o .git relativo, como no Git de quem o cria assim" grep -q '^gitdir: \.\./' "$work/relativo/.git"
  check "num worktree com o .git relativo, monta o .git comum e aponta o GIT_DIR" \
    test "$(args_in "$work/relativo")" = "$(expected_for_worktree relativo)"
else
  echo "Git $git_found: o .git relativo vem do 2.48, e os casos do worktree relativo ficam de fora."
fi

git -C "$repo" -c worktree.useRelativePaths=false worktree add -q --detach "$work/absoluto"
check "o worktree está com o .git absoluto" grep -q "^gitdir: $repo/" "$work/absoluto/.git"
check "num worktree com o .git absoluto, pede o mesmo" \
  test "$(args_in "$work/absoluto")" = "$(expected_for_worktree absoluto)"

finish "do .claude/skills/verificar/scripts/git-mount.sh"
