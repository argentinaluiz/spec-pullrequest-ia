#!/usr/bin/env bash
#
# A suíte de genericidade: impede que uma skill genérica do kit volte a se prender a este projeto.
#
#   genericity.sh <lista> [<pasta das skills>]
#
# A lista é um arquivo do projeto (.claude/skills/verificar/genericidade.txt), com uma linha por skill genérica
# (`generica<TAB><skill>`) e uma por padrão (`padrao<TAB><expressão regular estendida><TAB><descrição>`); as linhas
# em branco e as que começam com `#` não contam. A pasta das skills é `.claude/skills` por padrão, relativa à pasta
# de onde o script roda.
#
# Para cada skill genérica da lista, varre os arquivos de texto dela (o `SKILL.md` e os outros textos, os scripts, os
# hooks e o `agents/`), menos as pastas `test/`, onde um caso pode precisar citar um caminho do projeto para provar uma
# negação, e reprova duas coisas, dizendo a skill, o arquivo com a linha e o motivo:
#
#   - uma linha que casa com um padrão da lista (o prefixo dos identificadores do time, as pastas das apps, os comandos
#     da stack, o arquivo do Compose);
#   - uma referência de arquivo a outra skill (o caminho `skills/<outra>/` ou `../<outra>/`, onde `<outra>` é qualquer
#     outra pasta da pasta das skills, genérica ou do projeto). Chamar outra skill pelo nome não é referência de
#     arquivo, e o caminho para a pasta da própria skill vale.
#
# Uma skill da lista cuja pasta não existe também reprova, para uma renomeação não tirar a skill da varredura sem aviso.
#
# Sai com 0 sem achados, com 1 com achados e com 2 no uso errado ou numa lista malformada.

set -uo pipefail

list="${1:-}"
skills="${2:-.claude/skills}"

die() {
  printf '%s\n' "$@" >&2
  exit 2
}

[[ $# -ge 1 && $# -le 2 ]] || die 'Uso: genericity.sh <lista> [<pasta das skills>]'
[[ -f "$list" ]] || die "A lista \`$list\` não existe."
[[ -d "$skills" ]] || die "A pasta das skills \`$skills\` não existe."

generic=()
patterns=()
descriptions=()
while IFS=$'\t' read -r kind first second; do
  [[ -z "$kind" || "$kind" == \#* ]] && continue
  case "$kind" in
    generica) generic+=("$first") ;;
    padrao)
      [[ -n "$first" ]] || die "Uma linha \`padrao\` da lista não traz a expressão."
      patterns+=("$first")
      descriptions+=("$second")
      ;;
    *) die "A lista traz uma linha que não é \`generica\` nem \`padrao\`: $kind" ;;
  esac
done <"$list"

# Todas as skills da pasta, genéricas ou do projeto: o que uma skill genérica não pode referir por arquivo.
all_skills=()
while IFS= read -r dir; do
  all_skills+=("$(basename "$dir")")
done < <(find "$skills" -mindepth 1 -maxdepth 1 -type d | sort)

findings=0

report() {
  printf '%s\n' "$1"
  findings=$((findings + 1))
}

# Os arquivos de uma skill que a suíte varre: todos, menos os das pastas `test/`.
scanned_files() {
  find "$skills/$1" -type f -not -path '*/test/*' | sort
}

for skill in "${generic[@]}"; do
  if [[ ! -d "$skills/$skill" ]]; then
    report "$skill: a pasta da skill genérica não existe em $skills"
    continue
  fi
  while IFS= read -r file; do
    relative="${file#"$skills/$skill/"}"
    for i in "${!patterns[@]}"; do
      while IFS=: read -r line _; do
        report "$skill: $relative:$line: padrão \"${patterns[$i]}\" (${descriptions[$i]})"
      done < <(grep -InE -e "${patterns[$i]}" "$file" 2>/dev/null)
    done
    for other in "${all_skills[@]}"; do
      [[ "$other" != "$skill" ]] || continue
      while IFS=: read -r line _; do
        report "$skill: $relative:$line: referência a arquivo da skill $other"
      done < <(grep -InE -e "(skills|\.\.)/$other/" "$file" 2>/dev/null)
    done
  done < <(scanned_files "$skill")
done

if [[ $findings -gt 0 ]]; then
  echo "REPROVADO: $findings achado(s) de genericidade."
  exit 1
fi
echo "APROVADO: ${#generic[@]} skill(s) genérica(s) sem achado."
