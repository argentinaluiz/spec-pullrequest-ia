#!/usr/bin/env bash
#
# Prepara os insumos do revisor de conformidade na pasta do ticket: o diff da branch desde a base, com os arquivos novos
# que o Git não ignora; a mensagem do commit de plano; o desvio do contrato; e, numa mudança sem ticket, os critérios que
# ela precisa ter. Imprime os caminhos que a skill passa ao revisor. Roda de qualquer pasta do repositório: vai para a raiz.
#
#   review-inputs.sh [opções] <pai> <ticket>
#   review-inputs.sh [opções] sem-ticket <nome>
#
#   --tickets <pasta>   a pasta dos tickets, relativa à raiz do repositório (padrão: docs/tickets)
#   --base <ref>        a base da comparação (padrão: o ramo principal do remoto de origem, origin/<ramo>, ou origin/main
#                       se o remoto não diz qual é)
#   --desvio <comando>  o comando do desvio do contrato, chamado como `<comando> <commit de plano> <para, ou vazio> <arquivo>`
#                       (padrão: nenhum; o arquivo do desvio diz que nenhum foi declarado)
#
# Com ticket, o plano é o commit da branch que criou o arquivo de aceite (<pasta>/<pai>/<ticket>/aceite.md), e um ticket sem
# ele não foi planejado e não chega à revisão. Sem ticket, a pasta é <pasta>/sem-ticket/<nome>/ e precisa ter o criterios.md,
# escrito antes, com os critérios da mudança. Grava na pasta do ticket: review.diff, plano.txt (só com ticket) e
# contract-drift.txt (com ticket, sempre: o que o comando do desvio disse, ou que ele não pôde ser conferido). Os insumos não
# podem ir para um commit, então só grava se o `.gitignore` os ignora.
#
# Sai com 0 se preparou os insumos e com 2 se não deu (uso errado, base inexistente, ticket sem commit de plano, sem os critérios,
# insumo que iria para um commit), dizendo como resolver.

set -uo pipefail

abort() {
  printf '\nNÃO PREPARADO: %s\n' "$1" >&2
  printf 'Como resolver: %s\n' "$2" >&2
  exit 2
}

self="${0##*/}"

tickets=docs/tickets
base=""
drift_command=""
while [[ "${1:-}" == --* ]]; do
  case "$1" in
    --tickets | --base | --desvio)
      [[ $# -ge 2 ]] || abort "falta o valor de \`$1\`." "passe a opção com o valor, como em \`$1 <valor>\`."
      case "$1" in
        --tickets) tickets="${2%/}" ;;
        --base) base="$2" ;;
        --desvio) drift_command="$2" ;;
      esac
      shift 2
      ;;
    *) abort "a opção \`$1\` não existe." "as opções são --tickets, --base e --desvio." ;;
  esac
done

[[ $# -eq 2 ]] ||
  abort "o comando recebe dois argumentos: \`<pai> <ticket>\`, ou \`sem-ticket <nome>\`." \
    "passe a issue pai e o ticket, ou \`sem-ticket\` e um nome curto, como em \`$self PROJ-1 PROJ-123\` ou \`$self sem-ticket <nome>\`."
if [[ "$1" == sem-ticket ]]; then
  [[ "$2" =~ ^[a-z0-9][a-z0-9-]*$ ]] ||
    abort "o nome \`$2\` não vale para uma mudança sem ticket." \
      "use só letras minúsculas, algarismos e hífens, começando por letra ou algarismo, como em \`$self sem-ticket skill-de-revisao\`."
else
  [[ "$1" =~ ^[A-Z][A-Z0-9]*-[0-9]+$ && "$2" =~ ^[A-Z][A-Z0-9]*-[0-9]+$ ]] ||
    abort "os argumentos não são <pai> e <ticket>." \
      "passe a issue pai e o ticket, os dois no formato PREFIXO-N, como em \`$self PROJ-1 PROJ-123\` ou \`$self sem-ticket <nome>\`."
fi

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || abort "esta pasta não está num repositório do Git." "rode de dentro do repositório."

# A base padrão: o ramo principal do remoto de origem.
if [[ -z "$base" ]]; then
  base="$(git symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null)" || base=origin/main
fi
git rev-parse --verify --quiet "$base" >/dev/null ||
  abort "a base \`$base\` não existe neste clone." \
    "rode \`git fetch origin\`, ou passe outra base com \`--base <ref>\`."

# O `git diff` sem cor, sem diff externo, com os prefixos `a/` e `b/` fixos e os caminhos com acento sem aspas, seja qual for a
# configuração de quem roda. Uma skill de uso geral não carrega arquivo de projeto nem de outra skill, então esta e a `added_by` são
# cópias deliberadas das da verificação do projeto.
plain_diff() {
  git -c core.quotePath=false --no-pager diff --no-color --no-ext-diff --src-prefix=a/ --dst-prefix=b/ "$@"
}

# O commit mais recente de <commits> (um intervalo ou um ponto, como no `git log`) que criou o <arquivo>. O `--follow` segue o
# arquivo pelas renomeações: o commit que só o moveu não conta como o que o criou.
# added_by <commits> <arquivo>
added_by() {
  local commits
  commits="$(git log --follow --diff-filter=A --format=%H "$1" -- "$2")" || return 1
  printf '%s' "${commits%%$'\n'*}"
}

# O diff que o revisor lê: tudo o que a branch mudou desde que saiu da base, até a pasta de trabalho, com os arquivos novos que o
# Git não ignora. Compara com o ponto em que a branch saiu da base, e não com a ponta dela, para uma base que andou não trazer as
# mudanças alheias como se fossem da branch. Usa um índice temporário para contar os arquivos novos sem mexer no índice de quem
# trabalha. Grava também a lista dos arquivos que o diff acrescenta, em commit ou não.
# review_diff <arquivo do diff> <arquivo da lista dos acrescentados>
review_diff() {
  local fork_point dir code=0
  fork_point="$(git merge-base "$base" HEAD)" || return 1
  dir="$(mktemp -d)" || return 1
  (
    export GIT_INDEX_FILE="$dir/index"
    git read-tree HEAD && git add -A &&
      plain_diff --cached "$fork_point" >"$1" &&
      git -c core.quotePath=false diff --cached --name-only --diff-filter=A "$fork_point" >"$2"
  ) || code=1
  rm -rf "$dir"
  return $code
}

# O desvio do contrato desde o commit de plano, pelo comando que quem chama deu. O comando só grava o arquivo quando há desvio;
# o revisor recebe o arquivo sempre, então, sem desvio, ele leva o que o comando disse. Sem comando, ou se o comando falha, o
# arquivo diz que o desvio não foi conferido, para o revisor não ler um vazio.
# review_drift <commit de plano> <arquivo>
review_drift() {
  local plan="$1" drift="$2" out
  rm -f "$drift"
  if [[ -z "$drift_command" ]]; then
    echo "Nenhum comando do desvio do contrato foi declarado: não há desvio a conferir." >"$drift"
  # O comando é texto, que pode ter argumentos próprios, e recebe os três argumentos depois deles.
  elif out="$(bash -c "$drift_command"' "$@"' _ "$plan" "" "$drift" 2>&1)"; then
    [[ -s "$drift" ]] || printf '%s\n' "${out:-O comando do desvio do contrato não disse nada: não há desvio a conferir.}" >"$drift"
  else
    printf 'O desvio do contrato não pôde ser conferido. O que o comando disse:\n\n%s\n' "$out" >>"$drift"
  fi
}

dir="$tickets/$1/$2"
plan=""
if [[ "$1" == sem-ticket ]]; then
  [[ -f "$dir/criterios.md" ]] ||
    abort "não há critérios para a revisão: $dir/criterios.md não existe." \
      "escreva nele os critérios de aceite da mudança, antes de revisar, e rode \`$self sem-ticket $2\` de novo."
else
  acceptance="$dir/aceite.md"
  [[ -f "$acceptance" ]] ||
    abort "o arquivo de aceite $acceptance não existe." \
      "confira a issue pai e o ticket; se o ticket não foi planejado, planeje-o antes."
  plan="$(added_by "$base..HEAD" "$acceptance")" ||
    abort "não deu para ler o histórico da branch ($base..HEAD) com o \`git log\`." \
      "confira se a base existe (\`git fetch origin\`, ou outra base com \`--base\`) e se o clone tem o histórico inteiro."
  [[ -n "$plan" ]] ||
    abort "nenhum commit desta branch ($base..HEAD) criou o $acceptance: o ticket não tem commit de plano." \
      "planeje o ticket e faça o commit de plano antes da revisão."
fi

# Os insumos não podem ir para um commit: o .gitignore deve ignorar tudo na pasta do ticket, salvo o aceite e o mapa de testes.
# Confere antes de gravar, pelo padrão, para um abort não deixar arquivos prontos para um `git add`.
for file in review.diff plano.txt contract-drift.txt criterios.md; do
  git check-ignore -q --no-index "$dir/$file" ||
    abort "o $dir/$file não seria ignorado pelo Git, e iria para um commit." \
      "confira as regras de $tickets no .gitignore: ele deve ignorar tudo na pasta do ticket, salvo o aceite.md e o mapa de testes."
done

added="$(mktemp)" || abort "não deu para criar um arquivo temporário." "confira o espaço e as permissões da pasta temporária."
trap 'rm -f "$added"' EXIT
review_diff "$dir/review.diff" "$added" ||
  abort "não deu para montar o diff da branch contra $base." \
    "confira se o repositório do Git está íntegro, com \`git status\`, e se a base existe."
if [[ -n "$plan" ]]; then
  git show -s --format=%B "$plan" >"$dir/plano.txt" ||
    abort "não deu para ler a mensagem do commit de plano $plan." "confira o repositório do Git com \`git status\` e rode de novo."
  review_drift "$plan" "$dir/contract-drift.txt"
fi

printf 'Insumos do revisor de conformidade em %s:\n' "$dir"
printf -- '- diff: %s\n' "$dir/review.diff"
if [[ -n "$plan" ]]; then
  printf -- '- ticket: %s\n' "$2"
  printf -- '- mensagem do commit de plano %s: %s\n' "$(git rev-parse --short "$plan")" "$dir/plano.txt"
  printf -- '- desvio do contrato: %s\n' "$dir/contract-drift.txt"
else
  printf -- '- critérios: %s\n' "$dir/criterios.md"
  printf -- '- sem commit de plano: não há mensagem do plano nem desvio do contrato\n'
fi
if [[ -s "$added" ]]; then
  printf '\nArquivos que o diff acrescenta:\n'
  sed 's/^/- /' "$added"
fi
