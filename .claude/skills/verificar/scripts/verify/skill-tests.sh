#!/usr/bin/env bash
#
# Acha o mecanismo das skills sem lista à mão, para a verificação completa rodar os testes de todas elas e
# para a aprovação dela valer só enquanto esse mecanismo não muda. Uma skill com mecanismo tem uma pasta
# `scripts/` ou `hooks/`. Os testes das skills do kit ficam fora delas, na pasta `__tests__`, uma subpasta por skill e
# o auxiliar comum na raiz dela; os de uma skill do projeto ficam numa pasta `test/` ao lado dos scripts ou dos hooks:
#
#   .claude/skills/__tests__/<skill>/*.test.sh|cjs
#   .claude/skills/<skill>/scripts/test/*.test.sh|cjs
#   .claude/skills/<skill>/hooks/test/*.test.sh|cjs
#
# O projeto pode ter também a pasta de scripts dele, fora das skills (a `scripts/` da raiz), com os testes em `test/` ao lado
# dos scripts. Ela só entra na busca quando o terceiro argumento a dá; sem ele, a busca olha só as skills.
#
#   skill-tests.sh sh|cjs [pasta das skills [pasta de scripts do projeto]]    os testes em shell ou em Node, um caminho por linha
#   skill-tests.sh dirs [pasta das skills [pasta de scripts do projeto]]      as pastas scripts/, hooks/ e __tests__ que têm algum arquivo
#
# A pasta das skills é `.claude/skills` por padrão, relativa à raiz do repositório, de onde o verify.sh
# roda. Os caminhos saem ordenados byte a byte, seja qual for o idioma da máquina, e na forma da pasta recebida. Sai com 0, mesmo sem achar nada, e com 2 no
# uso errado.

set -uo pipefail

mode="${1:-}"
root="${2:-.claude/skills}"
project="${3:-}"

case "$mode" in
  sh | cjs)
    {
      find "$root/__tests__" -mindepth 2 -maxdepth 2 -type f -name "*.test.$mode" 2>/dev/null
      find "$root" -mindepth 4 -maxdepth 4 -type f -name "*.test.$mode" \
        \( -path "*/scripts/test/*" -o -path "*/hooks/test/*" \) 2>/dev/null
      [[ -z "$project" ]] || find "$project/test" -maxdepth 1 -type f -name "*.test.$mode" 2>/dev/null
    } | LC_ALL=C sort
    ;;
  dirs)
    for dir in "$root"/__tests__ "$root"/*/scripts "$root"/*/hooks ${project:+"$project"}; do
      [[ -d "$dir" && -n "$(find "$dir" -type f -print -quit 2>/dev/null)" ]] && echo "$dir"
    done | LC_ALL=C sort
    ;;
  *)
    echo 'Uso: .claude/skills/verificar/scripts/verify/skill-tests.sh sh|cjs|dirs [pasta das skills [pasta de scripts do projeto]]' >&2
    exit 2
    ;;
esac
