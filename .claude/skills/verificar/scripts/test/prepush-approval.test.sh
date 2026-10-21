#!/usr/bin/env bash
#
# Testes da aprovação do push, o modo `prepush` do verify.sh: ele só libera o conteúdo que o modo completo
# aprovou. O verify.sh roda copiado num repositório temporário, com um `docker` falso (a varredura de segredos
# passa) e a aprovação gravada à mão no formato que o `full` grava (`state=` e `acceptance=`), na pasta de
# estado do repositório temporário. Rodam na máquina, como o verify.sh. Os casos levam a tag do critério de
# aceite no nome.

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../../.." && pwd)"
# shellcheck source=../../../plan-ticket/scripts/test/helpers.sh
source "$HERE/../../../plan-ticket/scripts/test/helpers.sh"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
repo="$tmp/repo"
SK=.claude/skills/verificar
name="a aprovação do push confere o que o modo completo aprovou @LUI-195-CA2"

contains() {
  [[ "$1" == *"$2"* ]]
}

# O `docker` falso: toda chamada passa, como a da varredura de segredos.
mkdir -p "$tmp/bin"
printf '#!/usr/bin/env bash\nexit 0\n' >"$tmp/bin/docker"
chmod +x "$tmp/bin/docker"

# O repositório: a verificação copiada, na main.
mkdir -p "$repo/scripts" "$repo/$SK" "$repo/.claude/skills/proteger-harness/scripts" "$repo/apps/api" "$repo/docs/tickets"
cp -R "$ROOT/$SK/scripts" "$repo/$SK/"
rm -rf "$repo/$SK/scripts/test"
mkdir -p "$repo/.claude/skills/worktree/scripts" && cp "$ROOT/.claude/skills/worktree/scripts/harness-base.sh" "$repo/.claude/skills/worktree/scripts/"
cp "$ROOT/.claude/skills/proteger-harness/scripts/harness-dir.sh" "$ROOT/.claude/skills/proteger-harness/scripts/harness-state-guard.sh" \
  "$repo/.claude/skills/proteger-harness/scripts/"
git -C "$repo" init -q -b main
git -C "$repo" config user.email teste@exemplo.com
git -C "$repo" config user.name Teste
printf 'export const a = 1;\n' >"$repo/apps/api/existente.ts"
printf 'echo base\n' >"$repo/scripts/base.sh"
git -C "$repo" add -A && git -C "$repo" commit -q -m base
git -C "$repo" switch -q -c trabalho

# commit_file <arquivo> <conteúdo>: grava o arquivo e faz o commit.
commit_file() {
  mkdir -p "$(dirname "$repo/$1")"
  printf '%s\n' "$2" >"$repo/$1"
  git -C "$repo" add -A && git -C "$repo" commit -q -m "muda $1"
}

# prepush: roda o modo na pasta do repositório temporário, contra a main dele, com a pasta de estado dele.
# Deixa a saída em $out e o código em $code.
prepush() {
  out="$(cd "$repo" && env -u HARNESS_HEAD_REF CLAUDE_PROJECT_DIR="$repo" PATH="$tmp/bin:$PATH" HARNESS_BASE_REF=main \
    "$SK/scripts/verify.sh" prepush 2>&1)"
  code=$?
}

# head_state: o resumo do conteúdo dos caminhos que a verificação lê, no HEAD do repositório temporário: a
# regra do verify.sh (um objeto do Git por caminho, ou "ausente", e o sha256 da lista).
head_state() {
  (
    cd "$repo" || exit 1
    local -a paths=(apps compose.dev.yaml docs/tickets)
    local dir path
    while IFS= read -r dir; do paths+=("$dir"); done < <("$SK/scripts/verify/skill-tests.sh" dirs .claude/skills scripts)
    for path in "${paths[@]}"; do
      git rev-parse --verify --quiet "HEAD:$path" || echo ausente
    done | sha256sum | cut -d' ' -f1
  )
}

# approve <state> <checked|skipped>: grava a aprovação como o modo completo grava.
approve() {
  mkdir -p "$repo/.harness"
  printf 'state=%s\nacceptance=%s\n' "$1" "$2" >"$repo/.harness/full-ok"
}

code_is() { [[ $code -eq $1 ]]; }

prepush
check "$name: a branch que não altera nada do que a verificação lê não precisa de aprovação" code_is 0
check "$name: ... e diz que não precisa" contains "$out" "Não precisa de aprovação"

commit_file apps/novo.sh 'echo novo'
prepush
check "$name: sem aprovação, o commit que altera o que a verificação lê é recusado" code_is 1
check "$name: ... e diz que o modo completo não aprovou o último commit" contains "$out" "não aprovou o conteúdo do último commit"

approve "estado-de-outro-commit" checked
prepush
check "$name: a aprovação de outro conteúdo é recusada" code_is 1

approve "$(head_state)" checked
prepush
check "$name: a aprovação do conteúdo do último commit libera o push" code_is 0
check "$name: ... e diz que o modo completo aprovou" contains "$out" "O modo completo aprovou o conteúdo do último commit"

commit_file apps/api/novo.ts 'export const novo = true;'
approve "$(head_state)" skipped
prepush
check "$name: a aprovação sem o aceite é recusada quando a branch altera apps/" code_is 1
check "$name: ... e diz que o aceite não foi conferido" contains "$out" "sem conferir o aceite"

approve "$(head_state)" checked
prepush
check "$name: a aprovação com o aceite conferido libera a branch que altera apps/" code_is 0

# A pasta de scripts da raiz também é mecanismo que a verificação lê: mudar um arquivo dela invalida a aprovação.
commit_file scripts/mexe.sh 'echo mexe'
prepush
check "$name: a mudança na pasta de scripts da raiz invalida a aprovação do commit anterior" code_is 1
approve "$(head_state)" checked
prepush
check "$name: ... e a nova aprovação do conteúdo dela libera o push" code_is 0

# O hook de antes do push, o do settings.json, no repositório temporário: o `git push` passa quando o modo
# completo aprovou o último commit, e é negado quando não aprovou. Apagar uma branch remota não envia código.
hook_name="o hook de antes do push, chamado pelo settings.json, confere a aprovação do push @LUI-195-CA1 @LUI-195-CA2"
HOOK="$ROOT/$(jq -r '.hooks[][].hooks[].command' "$ROOT/.claude/settings.json" |
  sed -n 's#^"$CLAUDE_PROJECT_DIR"/\([^ ]*/push-verify\.sh\)\( .*\)\{0,1\}$#\1#p')"
push_hook() {
  err="$(jq -n --arg command "$1" '{tool_input: {command: $command}}' |
    env -u HARNESS_HEAD_REF CLAUDE_PROJECT_DIR="$repo" PATH="$tmp/bin:$PATH" HARNESS_BASE_REF=main "$HOOK" 2>&1 >/dev/null)"
  code=$?
}
approve "$(head_state)" checked
push_hook "git push origin trabalho"
check "$hook_name: o push do conteúdo aprovado passa" code_is 0
commit_file apps/outro.sh 'echo outro'
push_hook "git push origin trabalho"
check "$hook_name: o push do commit sem aprovação é negado" code_is 2
check "$hook_name: ... e a mensagem diz que a verificação de antes do push não passou" contains "$err" "O push foi negado"
push_hook "git push origin --delete trabalho"
check "$hook_name: apagar a branch remota passa sem aprovação" code_is 0

finish "da aprovação do push"
