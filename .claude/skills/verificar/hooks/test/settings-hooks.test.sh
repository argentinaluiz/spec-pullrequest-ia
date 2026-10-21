#!/usr/bin/env bash
#
# Testes dos hooks da verificação como o `settings.json` os chama: cada comando aponta para um arquivo da
# pasta hooks/ da skill verificar (e não para a pasta .claude/hooks/ de antes), que existe e roda, e o
# hook chamado por esse comando mantém o comportamento de sempre. O comportamento por inteiro é o das
# suítes dos hooks, ao lado deste teste. Rodam na máquina, como os hooks, porque eles usam o `git` e o
# `jq`, que o contêiner `api` não tem. Os casos levam a tag do critério de aceite no nome.

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../../.." && pwd)"
# shellcheck source=../../../plan-ticket/scripts/test/helpers.sh
source "$HERE/../../../plan-ticket/scripts/test/helpers.sh"

for tool in git jq; do
  command -v "$tool" >/dev/null || { echo "Falta o \`$tool\` na máquina: os hooks e o teste deles precisam dele."; exit 2; }
done

SETTINGS="$ROOT/.claude/settings.json"
SKILL_HOOKS=.claude/skills/verificar/hooks
VERIFY=.claude/skills/verificar/scripts/verify.sh
name="os hooks do settings.json são os da skill verificar e mantêm o comportamento @LUI-195-CA1"

# settings_hook <arquivo>: o caminho do hook, relativo à raiz do projeto, que o comando do settings.json
# chama, ou nada se nenhum comando o cita. O comando traz o caminho depois de "$CLAUDE_PROJECT_DIR".
settings_hook() {
  jq -r '.hooks[][].hooks[].command' "$SETTINGS" |
    sed -n "s#^\"\$CLAUDE_PROJECT_DIR\"/\([^ ]*/$1\)\( .*\)\{0,1\}\$#\1#p"
}

for hook in stop-verify.sh record-touched.sh push-verify.sh; do
  path="$(settings_hook "$hook")"
  check "$name: o settings.json chama o $hook pela skill" test "$path" = "$SKILL_HOOKS/$hook"
  check "$name: o $hook da skill existe e é executável" test -x "$ROOT/$SKILL_HOOKS/$hook"
  check "$name: o $hook não continua em .claude/hooks" test ! -e "$ROOT/.claude/hooks/$hook"
done

# O hook das frentes é da skill worktree, e o settings.json o chama pelo caminho dela: sem essa ligação, o hook existiria
# e nunca rodaria.
frentes_hook="$(settings_hook frentes-guard.sh)"
check "o settings.json chama o hook das frentes pela skill worktree, que o tem executável @LUI-199-CA5" \
  test "$frentes_hook" = .claude/skills/worktree/hooks/frentes-guard.sh -a -x "$ROOT/.claude/skills/worktree/hooks/frentes-guard.sh"

# O hook de antes do push, chamado pelo caminho do settings.json: nega o destravar, o full de um subagente e
# o CI= no comando da verificação, e libera o resto. O push em si é da aprovação, testada à parte.
PUSH="$ROOT/$(settings_hook push-verify.sh)"
command_input() {
  jq -n --arg command "$1" '{tool_input: {command: $command}}'
}
subagent_input() {
  jq -n --arg command "$1" '{agent_id: "a1", tool_input: {command: $command}}'
}
export CLAUDE_PROJECT_DIR="$ROOT"
expect_hook "$PUSH" 2 "$name: o hook de antes do push nega o destravar" \
  "$(command_input "$VERIFY unlock")" "só o usuário destrava"
expect_hook "$PUSH" 2 "$name: o hook de antes do push nega o full a um subagente" \
  "$(subagent_input "$VERIFY full")" "o \`full\` é de quem o chamou"
expect_hook "$PUSH" 2 "$name: o hook de antes do push nega o CI= no comando da verificação" \
  "$(command_input "CI=true $VERIFY full")" "desligariam a trava"
expect_hook "$PUSH" 0 "$name: o hook de antes do push libera um comando qualquer" \
  "$(command_input 'git status --short')"

# O hook que anota os arquivos tocados, chamado pelo caminho do settings.json, num projeto temporário.
project="$(mktemp -d)"
trap 'rm -rf "$project"' EXIT
git -C "$project" init -q
mkdir -p "$project/apps/api/src"
echo "export const a = 1;" >"$project/apps/api/src/a.ts"
state_dir="$(git -C "$project" rev-parse --show-toplevel)/.harness"
TOUCHED="$ROOT/$(settings_hook record-touched.sh)"
CLAUDE_PROJECT_DIR="$project" "$TOUCHED" <<<'{"session_id":"s1","tool_input":{"file_path":"apps/api/src/a.ts"}}'
check "$name: o hook de arquivos tocados anota a edição da sessão" test "$(cat "$state_dir/touched-s1" 2>/dev/null)" = "apps/api/src/a.ts"

# O hook de fim de turno, chamado pelo caminho do settings.json, com a verificação trocada por uma falsa:
# bloqueia pelo erro do arquivo que a sessão editou.
STOP="$ROOT/$(settings_hook stop-verify.sh)"
fake="$project/verify-falso.sh"
cat >"$fake" <<'FAKE'
#!/usr/bin/env bash
case "$1" in
  apps) printf 'api\n' ;;
  fast) printf '\n=== API: tipos\napps/api/src/a.ts(1,1): error TS2322\n\nREPROVADO: 1 verificação(ões) falharam.\n- API: tipos\n    Como corrigir: corrija.\n'; exit 1 ;;
esac
FAKE
chmod +x "$fake"
stop_code=0
CLAUDE_PROJECT_DIR="$project" HARNESS_TEST=1 HARNESS_VERIFY="$fake" "$STOP" <<<'{"session_id":"s1","stop_hook_active":false}' >/dev/null 2>&1 || stop_code=$?
check "$name: o hook de fim de turno bloqueia pelo erro do arquivo da sessão" test "$stop_code" -eq 2

finish "dos hooks do settings.json"
