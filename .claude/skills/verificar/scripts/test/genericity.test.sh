#!/usr/bin/env bash
#
# Teste da suíte de genericidade (.claude/skills/verificar/scripts/genericity.sh), pela linha de comando: os casos de
# unidade rodam sobre skills de mentira, numa pasta temporária, com uma lista de padrões de mentira; o caso de integração
# roda sobre as skills de verdade com a lista de verdade do projeto, e é ele que põe a suíte na verificação completa (a
# verificação acha e roda os testes de todas as skills). Rodam na máquina, só com o shell. Os casos levam a tag do
# critério de aceite no nome.

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../../.." && pwd)"
# shellcheck source=sh-helpers.sh
source "$HERE/sh-helpers.sh"

SUITE="$ROOT/.claude/skills/verificar/scripts/genericity.sh"
work="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$work"' EXIT

# skills <nome>: uma pasta de skills de mentira, vazia, em $skills.
fresh() {
  skills="$work/$1"
  rm -rf "$skills"
  mkdir -p "$skills"
}

# put <skill> <arquivo> <conteúdo>: grava o arquivo na skill, criando as pastas.
put() {
  mkdir -p "$skills/$1/$(dirname "$2")"
  printf '%s\n' "$3" >"$skills/$1/$2"
}

# list <linha...>: a lista do projeto de mentira, uma linha por argumento, com as tabulações escritas como `\t`.
list() {
  printf '%b\n' "$@" >"$work/lista.txt"
}

# run: roda a suíte sobre $skills com a lista de mentira, com a saída em $out e o código em $code.
run() {
  out="$("$SUITE" "$work/lista.txt" "$skills" 2>&1)"
  code=$?
}

# --- CA1: um padrão da lista do projeto numa skill genérica ---
pattern_found() {
  fresh padrao
  list '# a lista de mentira' 'generica\tlimpa' 'generica\tsuja' 'padrao\tFIXME-[0-9]+\tprefixo dos identificadores do time'
  put limpa SKILL.md $'# Limpa\n\nFala de um ticket PROJ-1, que não é do time.'
  put suja SKILL.md $'# Suja\n\nO ticket é o FIXME-12.'
  put suja scripts/rodar.sh $'#!/usr/bin/env bash\necho "FIXME-7"'
  put doprojeto SKILL.md $'# Do projeto\n\nTambém cita o FIXME-3, mas não é genérica.'
  run
  [[ $code -eq 1 ]] || return 1
  # Cada achado diz a skill, o arquivo com a linha e o padrão.
  [[ "$out" == *'suja: SKILL.md:3: padrão "FIXME-[0-9]+" (prefixo dos identificadores do time)'* ]] || return 1
  [[ "$out" == *'suja: scripts/rodar.sh:2: padrão "FIXME-[0-9]+" (prefixo dos identificadores do time)'* ]] || return 1
  # A skill limpa e a do projeto não são reprovadas.
  [[ "$out" != *'limpa:'* && "$out" != *'doprojeto:'* ]] || return 1
  # Sem nenhum achado, a suíte aprova.
  rm -rf "$skills/suja"
  list 'generica\tlimpa' 'padrao\tFIXME-[0-9]+\tprefixo dos identificadores do time'
  run
  [[ $code -eq 0 ]]
}
check "a suíte reprova uma skill genérica que traz um padrão da lista do projeto, dizendo a skill, o arquivo e o padrão @LUI-201-CA1" pattern_found

# --- CA2: uma referência de arquivo a outra skill, genérica ou do projeto ---
file_reference() {
  fresh referencia
  list 'generica\ta' 'generica\tb' 'generica\tc' 'generica\td' 'generica\te' 'generica\tf'
  put a SKILL.md $'# A\n\nLeia o `.claude/skills/b/modos/passo.md` antes de seguir.'
  put b modos/passo.md $'# Passo da B'
  put c SKILL.md $'# C\n\nRode o `.claude/skills/doprojeto/scripts/rodar.sh`.'
  put d scripts/carrega.sh $'#!/usr/bin/env bash\nHERE="$(dirname "$0")"\nsource "$HERE/../../doprojeto/scripts/lib.sh"'
  put e SKILL.md $'# E\n\nChame a skill `b` pelo nome e a `/doprojeto` também; não carregue arquivo nenhum delas.'
  put f SKILL.md $'# F\n\nO script da própria skill é o `.claude/skills/f/scripts/proprio.sh`.'
  put doprojeto scripts/rodar.sh $'#!/usr/bin/env bash'
  run
  [[ $code -eq 1 ]] || return 1
  # Cada achado diz a skill, o arquivo com a linha e a skill referida.
  [[ "$out" == *'a: SKILL.md:3: referência a arquivo da skill b'* ]] || return 1
  [[ "$out" == *'c: SKILL.md:3: referência a arquivo da skill doprojeto'* ]] || return 1
  [[ "$out" == *'d: scripts/carrega.sh:3: referência a arquivo da skill doprojeto'* ]] || return 1
  # A que só chama outra pelo nome e a que cita a própria pasta passam.
  [[ "$out" != *'e:'* && "$out" != *'f:'* && "$out" != *'b:'* ]]
}
check "a suíte reprova uma skill genérica que carrega arquivo de outra skill genérica ou de uma skill do projeto, e libera a que chama outra pelo nome @LUI-201-CA2" file_reference

# --- CA3: o kit deste projeto passa na suíte, que roda na verificação completa ---
the_kit() {
  # A lista de verdade e as skills de verdade; o resultado vai para a tela, para quem precisar corrigir um achado.
  out="$(cd "$ROOT" && "$SUITE" .claude/skills/verificar/genericidade.txt .claude/skills 2>&1)"
  code=$?
  [[ $code -eq 0 ]] || { echo "$out"; return 1; }
  # A lista traz as seis skills genéricas do kit e os quatro tipos de padrão do projeto, e a verificação acha este teste.
  local skill
  for skill in plan-ticket revisao-conformidade worktree proteger-harness implement tdd; do
    grep -qxP "generica\t$skill" "$ROOT/.claude/skills/verificar/genericidade.txt" || { echo "falta a skill $skill na lista"; return 1; }
  done
  grep -q '^padrao' "$ROOT/.claude/skills/verificar/genericidade.txt" || return 1
  "$ROOT/.claude/skills/verificar/scripts/verify/skill-tests.sh" sh "$ROOT/.claude/skills" | grep -q 'genericity\.test\.sh$'
}
check "o kit deste projeto passa na suíte de genericidade, que roda na verificação completa @LUI-201-CA3" the_kit

finish "da suíte de genericidade"
