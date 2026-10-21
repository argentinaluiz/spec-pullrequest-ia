# A definição única da base do harness e da pasta das travas da máquina. A base é a referência com que se compara a
# branch: a que a pessoa apontou em HARNESS_BASE_REF (como `test/main` num fork), senão o ramo principal que o remoto de
# origem diz (origin/HEAD), senão `origin/main`. Quem carrega este arquivo com `source` recebe o BASE_REF, o BASE_REMOTE
# (o que vem antes da primeira barra), o BASE_BRANCH (o que vem depois) e a função `harness_lock_dir`. É o único lugar que
# lê a variável e que sabe o padrão: o núcleo das frentes, os insumos da revisão de conformidade e a verificação do
# projeto olham para a mesma base.

BASE_REF="${HARNESS_BASE_REF:-$(git symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null || echo origin/main)}"
BASE_REMOTE="${BASE_REF%%/*}"
BASE_BRANCH="${BASE_REF#*/}"

# A pasta das travas da máquina: a `harness` do diretório comum do Git, que todos os checkouts do repositório dividem.
# O núcleo das frentes trava nela a numeração das frentes, e a verificação do projeto, a vez do modo completo.
# harness_lock_dir
harness_lock_dir() {
  echo "$(git rev-parse --path-format=absolute --git-common-dir)/harness"
}
