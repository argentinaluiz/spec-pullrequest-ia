#!/usr/bin/env bash
#
# A lista que a Guarda do harness lê neste projeto: a lista de arquivos protegidos (a chave protegidos.lista do
# .config/project) e, depois dela, cada ponto de convergência (a seção convergencia) como `aviso`, porque um ponto de
# convergência é onde dois pull requests paralelos esbarram. Os padrões das duas têm o mesmo significado (o da skill
# proteger-harness), e a lista vem antes: vale o primeiro padrão que casa. Imprime a lista na saída padrão, no formato
# da Guarda (o tipo, uma tabulação e o padrão).
#
#   scripts/protected-list.sh
#
# Roda da raiz do checkout cujas cópias valem: no workflow da Guarda, o da `main`. Sai com 0 se imprimiu a lista e com 2
# se não deu (o arquivo de configuração sem a chave da lista, a lista que não se lê), e aí a Guarda não roda.

set -uo pipefail

config=.config/project
list="$(git config --file "$config" --get protegidos.lista 2>/dev/null)"
[[ -n "$list" ]] || {
  echo "O $config não diz qual é a lista de arquivos protegidos (a chave protegidos.lista), e sem ela a Guarda não confere nada." >&2
  exit 2
}
[[ -f "$list" && -r "$list" ]] || {
  echo "A lista de arquivos protegidos, $list (protegidos.lista do $config), não existe ou não se lê." >&2
  exit 2
}

cat "$list" || exit 2
printf '\n# Os pontos de convergência do %s, como aviso.\n' "$config"
# Um projeto sem pontos de convergência não tem o que acrescentar: o `--get-regexp` sem resultado não é erro.
{ git config --file "$config" --get-regexp '^convergencia\.' || true; } | while read -r _ pattern; do
  printf 'aviso\t%s\n' "$pattern"
done
