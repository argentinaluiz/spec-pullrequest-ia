#!/usr/bin/env bash
#
# Acha o mecanismo das skills sem lista à mão, para a verificação completa rodar os testes de todas elas e
# para a aprovação dela valer só enquanto esse mecanismo não muda. Uma skill com mecanismo tem uma pasta
# `scripts/` ou `hooks/`, e os testes ficam numa pasta `test/` ao lado dos scripts ou dos hooks:
#
#   .claude/skills/<skill>/scripts/test/*.test.sh|cjs
#   .claude/skills/<skill>/hooks/test/*.test.sh|cjs
#
#   .claude/skills/verificar/scripts/verify/skill-tests.sh sh|cjs [pasta das skills]    os testes em shell ou em Node, um caminho por linha
#   .claude/skills/verificar/scripts/verify/skill-tests.sh dirs [pasta das skills]      as pastas scripts/ e hooks/ que têm algum arquivo
#
# A pasta das skills é `.claude/skills` por padrão, relativa à raiz do repositório, de onde o .claude/skills/verificar/scripts/verify.sh
# roda. Os caminhos saem ordenados e na forma da pasta recebida. Sai com 0, mesmo sem achar nada, e com 2 no
# uso errado.

set -uo pipefail

mode="${1:-}"
root="${2:-.claude/skills}"

case "$mode" in
  sh | cjs)
    find "$root" -mindepth 4 -maxdepth 4 -type f -name "*.test.$mode" \
      \( -path "*/scripts/test/*" -o -path "*/hooks/test/*" \) 2>/dev/null | sort
    ;;
  dirs)
    for dir in "$root"/*/scripts "$root"/*/hooks; do
      [[ -d "$dir" && -n "$(find "$dir" -type f -print -quit 2>/dev/null)" ]] && echo "$dir"
    done | sort
    ;;
  *)
    echo 'Uso: .claude/skills/verificar/scripts/verify/skill-tests.sh sh|cjs|dirs [pasta das skills]' >&2
    exit 2
    ;;
esac
