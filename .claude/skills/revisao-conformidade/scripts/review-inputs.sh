#!/usr/bin/env bash
#
# Prepara os insumos do revisor de conformidade na pasta do ticket: o diff da branch desde a base, com os arquivos novos
# que o Git não ignora; a mensagem do commit de plano; o desvio do contrato; e, numa mudança sem ticket, os critérios que
# ela precisa ter. Imprime os caminhos que a skill passa ao revisor. Roda de qualquer pasta do repositório: vai para a raiz.
#
#   review-inputs.sh <pai> <ticket>
#   review-inputs.sh sem-ticket <nome>
#
# Os valores do projeto vêm do arquivo de configuração dele, `.config/project` na raiz, lido com `git config --file`:
#
#   [tickets] pasta = <pasta>      a pasta dos tickets, relativa à raiz (obrigatória)
#   [contrato] desvio = <comando>  o comando do desvio do contrato, chamado como `<comando> <commit de plano> <para, ou
#                                  vazio> <arquivo>` (sem ele, o arquivo do desvio diz que nenhum foi declarado)
#   [revisao] sempre = <padrão>    o código que pede revisão com ou sem ticket, um padrão por linha
#   [protegidos] lista = <arquivo> a lista de arquivos protegidos: num ticket com aceite, os `bloqueado` dela (o harness)
#                                  também pedem revisão
#
# Antes de tudo, o script decide se a mudança pede revisão: pede quando um arquivo que a branch muda (até a pasta de
# trabalho) casa com um padrão de `revisao.sempre` ou, com ticket, com um `bloqueado` da lista, no padrão de caminho da
# skill proteger-harness. Diz qual arquivo casou com qual padrão; sem nenhum, diz que a mudança não pede revisão, não
# grava nada e sai com 3.
#
# A base da comparação é a do harness-base.sh da skill worktree, e o diff e o commit de plano, os do plan-git.sh da skill
# de plano.
#
# Com ticket, o plano é o commit da branch que criou o arquivo de aceite (<pasta>/<pai>/<ticket>/aceite.md), e um ticket sem
# ele não foi planejado e não chega à revisão. Sem ticket, a pasta é <pasta>/sem-ticket/<nome>/ e precisa ter o criterios.md,
# escrito antes, com os critérios da mudança. Grava na pasta do ticket: review.diff, plano.txt (só com ticket) e
# contract-drift.txt (com ticket, sempre: o que o comando do desvio disse, ou que ele não pôde ser conferido). Os insumos não
# podem ir para um commit, então só grava se o `.gitignore` os ignora.
#
# Sai com 0 se preparou os insumos, com 3 se a mudança não pede revisão e com 2 se não deu (uso errado, configuração sem a
# pasta dos tickets, base inexistente, ticket sem commit de plano, sem os critérios, insumo que iria para um commit), dizendo
# como resolver.

set -uo pipefail

abort() {
  printf '\nNÃO PREPARADO: %s\n' "$1" >&2
  printf 'Como resolver: %s\n' "$2" >&2
  exit 2
}

self="${0##*/}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

# A base (BASE_REF), da skill worktree, e o diff legível e o commit que criou um arquivo, da skill de plano.
# shellcheck source=../../worktree/scripts/harness-base.sh
source "$SCRIPT_DIR/../../worktree/scripts/harness-base.sh" ||
  abort "falta um arquivo de outra skill do kit, que este script carrega." "instale o kit inteiro: o script carrega a base da worktree, o diff da skill de plano e o padrão de caminho da proteger-harness."
# shellcheck source=../../plan-ticket/scripts/plan-git.sh
source "$SCRIPT_DIR/../../plan-ticket/scripts/plan-git.sh" ||
  abort "falta um arquivo de outra skill do kit, que este script carrega." "instale o kit inteiro: o script carrega a base da worktree, o diff da skill de plano e o padrão de caminho da proteger-harness."
# O padrão de caminho dos padrões de revisão, da skill proteger-harness.
# shellcheck source=../../proteger-harness/scripts/path-pattern.sh
source "$SCRIPT_DIR/../../proteger-harness/scripts/path-pattern.sh" ||
  abort "falta um arquivo de outra skill do kit, que este script carrega." "instale o kit inteiro: o script carrega a base da worktree, o diff da skill de plano e o padrão de caminho da proteger-harness."
git rev-parse --verify --quiet "$BASE_REF" >/dev/null ||
  abort "a base \`$BASE_REF\` não existe neste clone." \
    "rode \`git fetch origin\`, ou aponte outra base com a variável HARNESS_BASE_REF."

# Os valores do projeto, do .config/project.
tickets="$(git config --file .config/project --get tickets.pasta 2>/dev/null)"
tickets="${tickets%/}"
[[ -n "$tickets" ]] ||
  abort "o .config/project não diz a pasta dos tickets (a chave tickets.pasta)." \
    "acrescente ao .config/project a seção \`[tickets]\` com \`pasta = <pasta dos tickets>\` e rode de novo."
drift_command="$(git config --file .config/project --get contrato.desvio 2>/dev/null)"

# O que a branch tem até a pasta de trabalho, num índice temporário: o HEAD mais as mudanças e os arquivos novos que o Git
# não ignora, sem mexer no índice de quem trabalha. A comparação é com o ponto em que a branch saiu da base, e não com a
# ponta dela, para uma base que andou não trazer as mudanças alheias como se fossem da branch.
work="$(mktemp -d)" || abort "não deu para criar uma pasta temporária." "confira o espaço e as permissões da pasta temporária."
trap 'rm -rf "$work"' EXIT
fork_point="$(git merge-base "$BASE_REF" HEAD)" &&
  GIT_INDEX_FILE="$work/index" git read-tree HEAD && GIT_INDEX_FILE="$work/index" git add -A ||
  abort "não deu para montar o diff da branch contra $BASE_REF." \
    "confira se o repositório do Git está íntegro, com \`git status\`, e se a base existe."

# O diff da branch, no índice temporário.
# branch_diff <argumentos do git diff...>
branch_diff() {
  GIT_INDEX_FILE="$work/index" plain_diff --cached "$@" "$fork_point"
}

# Por que a mudança pede revisão: o primeiro arquivo dela que casa com um padrão de `revisao.sempre` ou, com ticket, com um
# `bloqueado` da lista de arquivos protegidos. Não imprime nada quando nenhum casa.
# review_reason <com ticket: sim|nao>
review_reason() {
  local key pattern list type file i
  local -a origins=() patterns=() regexes=()
  while IFS= read -r pattern; do
    [[ -n "$pattern" ]] && origins+=(revisao.sempre) && patterns+=("$pattern")
  done < <(git config --file .config/project --get-all revisao.sempre 2>/dev/null)
  list="$(git config --file .config/project --get protegidos.lista 2>/dev/null)"
  if [[ "$1" == sim && -n "$list" && -r "$list" ]]; then
    while IFS=$'\t' read -r type pattern; do
      [[ "$type" == bloqueado && -n "$pattern" ]] && origins+=("bloqueado de $list") && patterns+=("$pattern")
    done <"$list"
  fi
  for pattern in "${patterns[@]}"; do
    regexes+=("$(pattern_regex "$pattern")")
  done
  while IFS= read -r file; do
    for i in "${!regexes[@]}"; do
      if [[ "$file" =~ ${regexes[i]} ]]; then
        printf '%s casa com `%s` (%s)' "$file" "${patterns[i]}" "${origins[i]}"
        return 0
      fi
    done
  done < <(branch_diff --name-only)
}

# O desvio do contrato desde o commit de plano, pelo comando do .config/project. O comando só grava o arquivo quando há desvio;
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

if [[ "$1" == sem-ticket ]]; then with_ticket=nao; else with_ticket=sim; fi
reason="$(review_reason "$with_ticket")"
if [[ -z "$reason" ]]; then
  printf 'A mudança não pede revisão de conformidade: nenhum arquivo dela casa com um padrão de revisao.sempre%s.\n' \
    "$([[ $with_ticket == sim ]] && echo ' nem com um bloqueado da lista de arquivos protegidos')"
  exit 3
fi

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
  plan="$(added_by "$BASE_REF..HEAD" "$acceptance")" ||
    abort "não deu para ler o histórico da branch ($BASE_REF..HEAD) com o \`git log\`." \
      "confira se a base existe (\`git fetch origin\`, ou outra base com a variável HARNESS_BASE_REF) e se o clone tem o histórico inteiro."
  [[ -n "$plan" ]] ||
    abort "nenhum commit desta branch ($BASE_REF..HEAD) criou o $acceptance: o ticket não tem commit de plano." \
      "planeje o ticket e faça o commit de plano antes da revisão."
fi

# Os insumos não podem ir para um commit: o .gitignore deve ignorar tudo na pasta do ticket, salvo o aceite e o mapa de testes.
# Confere antes de gravar, pelo padrão, para um abort não deixar arquivos prontos para um `git add`.
if [[ -n "$plan" ]]; then written=(review.diff plano.txt contract-drift.txt); else written=(review.diff criterios.md); fi
for file in "${written[@]}"; do
  git check-ignore -q --no-index "$dir/$file" ||
    abort "o $dir/$file não seria ignorado pelo Git, e iria para um commit." \
      "confira as regras de $tickets no .gitignore: ele deve ignorar tudo na pasta do ticket, salvo o aceite.md e o mapa de testes."
done

added="$work/acrescentados"
branch_diff >"$dir/review.diff" && branch_diff --name-only --diff-filter=A >"$added" ||
  abort "não deu para montar o diff da branch contra $BASE_REF." \
    "confira se o repositório do Git está íntegro, com \`git status\`, e se a base existe."
if [[ -n "$plan" ]]; then
  git show -s --format=%B "$plan" >"$dir/plano.txt" ||
    abort "não deu para ler a mensagem do commit de plano $plan." "confira o repositório do Git com \`git status\` e rode de novo."
  review_drift "$plan" "$dir/contract-drift.txt"
fi

printf 'Pede revisão de conformidade: %s.\n\n' "$reason"
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
