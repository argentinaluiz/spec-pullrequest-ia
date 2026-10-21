# As primitivas de Git do plano, num lugar só: o diff que se lê (o da página do plano, o dos insumos da revisão e o do
# contrato do projeto) e o commit que criou um arquivo, que é como se acha o commit de plano de um ticket (o que criou o
# arquivo de aceite). Quem carrega este arquivo com `source` recebe as duas funções.

# O `git diff` sem cor, sem diff externo, com os prefixos `a/` e `b/` fixos e os caminhos com acento sem aspas, seja qual
# for a configuração do Git de quem roda (`diff.noprefix`, `diff.mnemonicPrefix`, `core.quotePath`), para quem o lê achar
# o arquivo de cada trecho.
# plain_diff <argumentos do git diff...>
plain_diff() {
  git -c core.quotePath=false --no-pager diff --no-color --no-ext-diff --src-prefix=a/ --dst-prefix=b/ "$@"
}

# O commit mais recente de <commits> (um intervalo ou um ponto, como no `git log`) que criou o <arquivo>. O `--follow`
# segue o arquivo pelas renomeações: o commit que só o moveu não conta como o que o criou. Não imprime nada quando nenhum
# o criou, e falha quando o `git log` não lê o histórico. Com `<base>..HEAD` e o arquivo de aceite, é o commit de plano.
# added_by <commits> <arquivo>
added_by() {
  local commits
  commits="$(git log --follow --diff-filter=A --format=%H "$1" -- "$2")" || return 1
  printf '%s' "${commits%%$'\n'*}"
}
