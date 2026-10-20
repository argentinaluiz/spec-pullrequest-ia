# A definição única da base do harness: a referência com que se compara a branch (`origin/main` por
# padrão, ou a que a pessoa apontou em HARNESS_BASE_REF, como `test/main` num fork). Quem carrega este
# arquivo com `source` (o núcleo das frentes e a verificação de um projeto) recebe o BASE_REF, o BASE_REMOTE (o que vem
# antes da primeira barra) e o BASE_BRANCH (o que vem depois). É o único lugar que lê a variável e que sabe o
# padrão, para a ordem das migrações, a varredura de segredos e a frente nova olharem para a mesma base.

BASE_REF="${HARNESS_BASE_REF:-origin/main}"
BASE_REMOTE="${BASE_REF%%/*}"
BASE_BRANCH="${BASE_REF#*/}"
