#!/usr/bin/env bash
#
# A lista que a Guarda do harness lê neste projeto: a lista de arquivos protegidos (a chave protegidos.lista do
# .config/project); depois dela, os arquivos de aceite da pasta dos tickets (tickets.pasta) como `congelado` e os mapas de
# testes como `aviso`; e cada ponto de convergência (a seção convergencia) como `aviso`, porque um ponto de convergência é
# onde dois pull requests paralelos esbarram. A pasta dos tickets e os pontos têm um dono só, o .config/project. Os padrões das duas têm o mesmo significado (o da skill
# proteger-harness), e a lista vem antes: vale o primeiro padrão que casa. Imprime a lista na saída padrão, no formato
# da Guarda (o tipo, uma tabulação e o padrão).
#
#   scripts/protected-list.sh
#
# Roda da raiz do checkout cujas cópias valem: no workflow da Guarda, o da `main`. Sai com 0 se imprimiu a lista e com 2
# se não deu (o arquivo de configuração sem a chave da lista ou da pasta dos tickets, a lista que não se lê, um ponto de
# convergência sem padrão), e aí a Guarda não roda.

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

tickets="$(git config --file "$config" --get tickets.pasta 2>/dev/null)"
tickets="${tickets%/}"
[[ -n "$tickets" ]] || {
  echo "O $config não diz a pasta dos tickets (a chave tickets.pasta), e sem ela a Guarda não sabe quais aceites estão congelados." >&2
  exit 2
}

cat "$list" || exit 2
printf '\n# Os arquivos de aceite e os mapas de testes da pasta dos tickets do %s.\n' "$config"
printf 'congelado\t%s/*/*/aceite.md\n' "$tickets"
printf 'aviso\t%s/*/*/mapa-de-testes.*\n' "$tickets"
printf '\n# Os pontos de convergência do %s, como aviso.\n' "$config"
# Um projeto sem pontos de convergência não tem o que acrescentar: o `--get-regexp` sem resultado não é erro.
while read -r key pattern; do
  [[ -n "$pattern" ]] || {
    echo "A chave $key do $config está sem padrão: a linha é \`<tipo> = <padrão>\`." >&2
    exit 2
  }
  printf 'aviso\t%s\n' "$pattern"
done < <(git config --file "$config" --get-regexp '^convergencia\.' || true)
