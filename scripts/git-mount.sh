#!/usr/bin/env bash
#
# O que o contêiner da varredura de segredos do scripts/verify.sh precisa para ler o histórico do Git
# do checkout, além da pasta montada. Carregado com `source`, define `gitleaks_git_args`, que imprime,
# um por linha, os argumentos extras do `docker run` (a pasta atual é montada em /repo).
#
# Num repositório, o `.git` é uma pasta dentro da pasta montada, e nada mais é preciso. Num worktree, é um
# arquivo que aponta para o `.git` comum, fora dela, às vezes com caminho relativo, que no contêiner não
# leva a lugar nenhum: o `.git` comum é montado no mesmo caminho absoluto da máquina, só para leitura, e o
# `GIT_DIR` aponta para a pasta do worktree dentro dele (docs/lld.md, seção 6, "Máscara do `.git`"). A forma
# `--mount` é a que vale: a `-v origem:destino:ro` não monta um caminho igual nos dois lados no Docker Desktop.

gitleaks_git_args() {
  # Um `.git` que é pasta (repositório) ou que não existe (fora do Git) não pede nada.
  [[ -f .git ]] || return 0
  local common gitdir
  { read -r common && read -r gitdir; } < <(git rev-parse --path-format=absolute --git-common-dir --absolute-git-dir) ||
    return 1
  printf '%s\n' --mount "type=bind,source=$common,target=$common,readonly" \
    -e "GIT_DIR=$gitdir" -e GIT_WORK_TREE=/repo
}
