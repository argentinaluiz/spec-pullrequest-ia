#!/usr/bin/env bash
#
# A suíte de genericidade: impede que uma skill genérica do kit volte a se prender a este projeto.
#
#   genericity.sh <lista> [<pasta das skills>]
#
# A lista é um arquivo do projeto (.claude/skills/verificar/genericidade.txt), que descreve o formato dela e é a dona
# dos padrões. A pasta das skills é `.claude/skills` por padrão, relativa à pasta de onde o script roda.
#
# Para cada skill genérica da lista, varre os arquivos dela (o `SKILL.md` e os outros textos, os scripts, os hooks e o
# `agents/`), menos as pastas `test/`, onde um caso pode precisar citar um caminho do projeto para provar uma negação,
# e reprova duas coisas, dizendo a skill, o arquivo com a linha e o motivo:
#
#   - uma linha que casa com um padrão da lista;
#   - uma referência de arquivo a outra skill: o caminho `skills/<outra>` ou `../<outra>`, onde `<outra>` é qualquer
#     outra pasta da pasta das skills, genérica ou do projeto. Chamar outra skill pelo nome não é referência de
#     arquivo, e o caminho para a pasta da própria skill vale.
#
# Uma skill da lista cuja pasta não existe, ou da qual nenhum arquivo foi varrido, também reprova: uma renomeação não
# tira a skill da varredura sem aviso. É uma rede de proteção por padrões, e não a prova de que uma skill é genérica:
# um padrão novo é uma linha na lista.
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

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

generic=()
patterns=()
descriptions=()
: >"$work/padroes"
while IFS=$'\t' read -r kind first second; do
  [[ -z "$kind" || "$kind" == \#* ]] && continue
  case "$kind" in
    generica) generic+=("$first") ;;
    padrao)
      [[ -n "$first" ]] || die "Uma linha \`padrao\` da lista não traz a expressão."
      patterns+=("$first")
      descriptions+=("$second")
      printf '%s\n' "$first" >>"$work/padroes"
      ;;
    *) die "A lista traz uma linha que não é \`generica\` nem \`padrao\`: $kind" ;;
  esac
done <"$list"

# Todas as skills da pasta, genéricas ou do projeto: o que uma skill genérica não pode referir por arquivo.
mapfile -t all_skills < <(find "$skills" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)

findings=0

report() {
  printf '%s\n' "$1"
  findings=$((findings + 1))
}

for skill in "${generic[@]}"; do
  dir="$skills/$skill"
  if [[ ! -d "$dir" ]]; then
    report "$skill: a pasta da skill genérica não existe em $skills"
    continue
  fi
  # Os arquivos da skill, podando as pastas `test/` pelo nome (e não pelo caminho inteiro, que pode ter uma `test` acima).
  mapfile -d '' -t files < <(find "$dir" -type d -name test -prune -o -type f -print0 | sort -z)
  if [[ ${#files[@]} -eq 0 ]]; then
    report "$skill: nenhum arquivo da skill genérica foi varrido em $dir"
    continue
  fi

  # Os padrões: um grep só por skill, e depois, nas linhas achadas, qual padrão casou.
  if [[ ${#patterns[@]} -gt 0 ]]; then
    while IFS= read -r hit; do
      file="${hit%%:*}"
      rest="${hit#*:}"
      line="${rest%%:*}"
      content="${rest#*:}"
      for i in "${!patterns[@]}"; do
        if grep -qE -e "${patterns[$i]}" <<<"$content"; then
          report "$skill: ${file#"$dir/"}:$line: padrão \"${patterns[$i]}\" (${descriptions[$i]})"
        fi
      done
    done < <(grep -HInE -f "$work/padroes" -- "${files[@]}")
  fi

  # As referências a arquivo de outra skill: um grep só por skill, com as outras skills numa alternância.
  others=()
  for name in "${all_skills[@]}"; do
    [[ "$name" == "$skill" ]] || others+=("$name")
  done
  if [[ ${#others[@]} -gt 0 ]]; then
    alternation="$(IFS='|'; echo "${others[*]}")"
    while IFS= read -r hit; do
      file="${hit%%:*}"
      rest="${hit#*:}"
      line="${rest%%:*}"
      match="${rest#*:}"
      referred="${match#*/}"
      referred="${referred%%[!A-Za-z0-9._-]*}"
      report "$skill: ${file#"$dir/"}:$line: referência a arquivo da skill $referred"
    done < <(grep -HInoE -e "(skills|\.\.)/($alternation)([^A-Za-z0-9._-]|$)" -- "${files[@]}" | sort -u)
  fi
done

if [[ $findings -gt 0 ]]; then
  echo "REPROVADO: $findings achado(s) de genericidade."
  exit 1
fi
echo "APROVADO: ${#generic[@]} skill(s) genérica(s) sem achado."
