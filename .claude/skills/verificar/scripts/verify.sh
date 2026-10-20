#!/usr/bin/env bash
#
# Verificação do projeto. É a única definição de "passou": a CI chama o modo completo,
# e os hooks chamam o modo rápido e o de antes do push. Mora na skill do projeto /verificar e roda da raiz
# do repositório: .claude/skills/verificar/scripts/verify.sh <modo>. Abaixo, `verify.sh` é esse caminho.
#
#   verify.sh fast [app...]                        tipos e lint das apps citadas (todas, se nenhuma)
#   verify.sh full [--start-apps]                  o grupo completo de todas as apps, os testes do
#                                                  harness, o aceite e a varredura de segredos; é o
#                                                  veredito, e só ele libera o push. Roda uma vez, no
#                                                  fim da tarefa; trava na terceira reprovação igual
#                                                  seguida, fora da CI
#   verify.sh full <app>... [--start-apps] só o grupo completo das apps citadas; não libera
#                                                  o push
#   verify.sh unlock                               tira a trava do modo completo; é do usuário, e um
#                                                  hook nega o comando ao agente
#   verify.sh prepush                              a varredura de segredos, e a conferência de que o
#                                                  modo completo aprovou o que está no último commit
#   verify.sh apps                                 as apps registradas, uma por linha
#   verify.sh plan <pai> <ticket> [<commit>]
#                                                  atalho para o plan-page.sh da skill de plano, com
#                                                  os valores deste projeto; <pai> é a issue pai do
#                                                  ticket, a pasta dele em docs/tickets
#
# Roda tudo nos contêineres do compose.dev.yaml, que já têm de estar no ar. Na suíte no navegador,
# a web e a API também têm de estar respondendo; o `--start-apps` as sobe, e é para a CI.
#
# Com ACCEPTANCE_BODY_FILE apontando para um arquivo com o corpo do pull request, o modo
# completo confere também o aceite: a seção "Aceite" do PR e a cobertura dos critérios por testes.
# E, sem bloquear, avisa quando o contrato ou o schema mudou depois do commit de plano.
#
# O modo completo sem apps (o veredito) roda um por vez na máquina, entre todos os checkouts do
# repositório. A trava fica na pasta `harness/` do `.git` comum, que os checkouts dividem, e o `full` que
# chega com outro em andamento espera, mostrando o checkout, a branch, o PID e a hora de início do que está
# rodando. A espera não conta como reprovação na trava das reprovações repetidas nem apaga a aprovação
# anterior, mesmo interrompida. Não vale na CI. O mecanismo está no full-semaphore.sh. Como a
# espera soma ao tempo do `full`, ele deve rodar em segundo plano.
#
# Na API, o passo "ordem das migrações" reprova a migração nova da branch (a que a base não tem) com nome
# anterior à mais recente da base (HARNESS_BASE_REF), porque o Prisma aplica as migrações na ordem do
# nome, e diz como recriá-la com um nome posterior.
#
# Sai com 0 se tudo passou, 1 se alguma verificação falhou e 2 se não deu para verificar.

set -uo pipefail
cd "$(dirname "$0")/../../../.."

# As apps verificadas. O nome é o da pasta em apps/ e o do serviço no Compose. O grupo de cada
# uma fica em .claude/skills/verificar/scripts/verify/<app>.sh, que define <app>_fast, <app>_full e <app>_reports.
APPS=(api web)

COMPOSE=(docker compose -f compose.dev.yaml)
# O mesmo comando, como texto, para as mensagens de como corrigir.
EXEC="${COMPOSE[*]} exec"
# Se a suíte no navegador pode subir a web e a API. O `--start-apps` liga.
START_APPS=no
# Versão fixa, para o mesmo diff dar sempre o mesmo resultado.
GITLEAKS_IMAGE=ghcr.io/gitleaks/gitleaks:v8.30.1
# A base da comparação (BASE_REF), que a varredura de segredos, a ordem das migrações e o desvio do plano
# usam, vem do scripts/harness-base.sh, o mesmo que o scripts/frentes.sh carrega.
# shellcheck source=../../../../scripts/harness-base.sh
source scripts/harness-base.sh
# O fim da branch, para o desvio do plano. Na CI de um pull request, a pasta de trabalho é o merge da
# branch na main, e a main traria as próprias mudanças como desvio: a CI aponta o commit da branch.
# Vazio, o desvio compara com a pasta de trabalho.
HEAD_REF="${HARNESS_HEAD_REF:-}"
# A página do plano, que o atalho `plan` monta, é da skill de plano, e o desvio do contrato, o único dono da comparação com o
# commit de plano, é um comando da skill contrato: acrescenta a visão do desvio ao arquivo que recebe e avisa no PR, sem bloquear.
# No contêiner `api`, os scripts das skills ficam no mesmo caminho, dentro do repositório montado em /repo.
PLAN_SKILL_SCRIPTS=.claude/skills/plan-ticket/scripts
CONTRACT_DRIFT=.claude/skills/contrato/scripts/contract-drift.sh
# O que a verificação lê. Só uma mudança nestes caminhos invalida a aprovação do modo completo. Além das
# pastas fixas, entram as de scripts e de hooks de todas as skills (o mecanismo delas, que a verificação
# confere), achadas por skill-tests.sh; o texto de uma skill não entra.
VERIFIED_PATHS=(apps compose.dev.yaml scripts docs/tickets)
while IFS= read -r skill_dir; do
  VERIFIED_PATHS+=("$skill_dir")
done < <(.claude/skills/verificar/scripts/verify/skill-tests.sh dirs)
# O estado interno da verificação (as aprovações e a trava) fica na pasta de estado do harness, que
# o .claude/skills/proteger-harness/scripts/harness-dir.sh define. Ela pode ficar vazia (a raiz não se alcança): só os modos que gravam
# estado a exigem, com o `require_state`.
# shellcheck source=../../proteger-harness/scripts/harness-dir.sh
source .claude/skills/proteger-harness/scripts/harness-dir.sh
# Onde o modo completo registra o que aprovou.
APPROVAL_FILE="$HARNESS_DIR/full-ok"
# A trava das reprovações repetidas do modo completo, com as funções do full-lock.sh.
FULL_LOCK_FILE="$HARNESS_DIR/full-lock"
# shellcheck source=full-lock.sh
source .claude/skills/verificar/scripts/full-lock.sh
# O semáforo do modo completo, com as funções do full-semaphore.sh.
# shellcheck source=full-semaphore.sh
source .claude/skills/verificar/scripts/full-semaphore.sh
# O que o contêiner da varredura de segredos precisa para ler o histórico num worktree, com a função
# `gitleaks_git_args` do git-mount.sh.
# shellcheck source=git-mount.sh
source .claude/skills/verificar/scripts/git-mount.sh
# A pasta dos tickets.
TICKETS_DIR=docs/tickets

failures=()

usage() {
  # O cabeçalho deste arquivo, até a primeira linha em branco.
  sed -n '3,/^$/p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

# Os caminhos do contrato (o snapshot da OpenAPI e o schema do Prisma) e o comando do Node, da skill contrato, que o grupo da API
# também carrega.
# shellcheck source=../../contrato/scripts/contract-lib.sh
source .claude/skills/contrato/scripts/contract-lib.sh

for app in "${APPS[@]}"; do
  # shellcheck source=/dev/null
  source ".claude/skills/verificar/scripts/verify/$app.sh"
done

# Sai com o uso se algum nome não é de uma app registrada.
check_apps() {
  local app
  for app in "$@"; do
    [[ " ${APPS[*]} " == *" $app "* ]] || usage
  done
}

# Não deu para verificar: falha fechada, com o que fazer.
abort() {
  printf '\nNÃO VERIFICADO: %s\n' "$1" >&2
  printf 'Como resolver: %s\n' "$2" >&2
  exit 2
}

# Aborta se a pasta de estado do harness não pôde ser definida. Só os modos que gravam estado a pedem
# (o `full` sem apps, o `prepush` e o `unlock`); os outros não dependem dela.
require_state() {
  [[ -n "$HARNESS_DIR" ]] ||
    abort "não foi possível definir a pasta de estado do harness: a raiz do checkout não é uma pasta que se alcança." \
      "rode o .claude/skills/verificar/scripts/verify.sh de um checkout do repositório e, se o CLAUDE_PROJECT_DIR está definido, confira que ele aponta para a raiz dele."
}

# Um comando que não verifica falhou: o erro e o que fazer, e devolve 1.
# fail <erro> <como corrigir>
fail() {
  printf '\n%s\n' "$1" >&2
  printf 'Como corrigir: %s\n' "$2" >&2
  return 1
}

# step <nome> <como corrigir> <comando...>
step() {
  local name="$1" hint="$2"
  shift 2
  printf '\n=== %s\n' "$name"
  if full_semaphore_unheld "$@"; then
    return 0
  fi
  failures+=("$name"$'\n'"    Como corrigir: $hint")
  return 1
}

in_container() {
  local service="$1"
  shift
  "${COMPOSE[@]}" exec -T "$service" "$@"
}

require_container() {
  in_container "$1" true >/dev/null 2>&1 ||
    abort "o contêiner \`$1\` não está no ar." \
      "suba o ambiente com \`${COMPOSE[*]} up -d --build --wait\` e rode de novo."
}

# Confere o relatório JSON de uma suíte dentro do contêiner, onde está o Node.
check_report() {
  local service="$1" kind="$2" file="$3"
  in_container "$service" node - "$kind" "$file" <.claude/skills/verificar/scripts/check-report.cjs
}

responds() {
  in_container "$1" node -e \
    "fetch('$2').then(() => process.exit(0), () => process.exit(1))" >/dev/null 2>&1
}

# Espera o endereço responder, por até três minutos, num só Node dentro do contêiner, que tenta de
# novo a cada segundo. Com o arquivo de PID do servidor, desiste na hora em que o processo dele para,
# em vez de esperar o prazo: o PID gravado deixou de existir ou virou zumbi. Enquanto o arquivo não
# tem um PID, o servidor ainda está subindo.
# wait_for <serviço> <endereço> [arquivo de PID, no contêiner]
wait_for() {
  in_container "$1" node -e "
    const fs = require('node:fs');
    const deadline = Date.now() + 180000;
    const pidFile = '${3:-}';
    const read = (file) => {
      try {
        return fs.readFileSync(file, 'utf8');
      } catch {
        return null;
      }
    };
    const stopped = () => {
      const pid = pidFile && read(pidFile)?.trim();
      if (!pid || !/^[0-9]+$/.test(pid)) return false;
      const stat = read('/proc/' + pid + '/stat');
      return stat === null || stat.slice(stat.lastIndexOf(') ') + 2, stat.lastIndexOf(') ') + 3) === 'Z';
    };
    const attempt = () =>
      fetch('$2', { signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) }).then(
        () => process.exit(0),
        () => (Date.now() < deadline && !stopped() ? setTimeout(attempt, 1000) : process.exit(1)),
      );
    attempt();" >/dev/null 2>&1
}

# O Node no contêiner `api`: o .claude/skills/ambiente/scripts/node-in-api.sh, cujo cabeçalho diz como ele roda.
node_in_api() {
  "$CONTRACT_NODE" "$@"
}

# O relatório dos testes do harness, relativo à pasta da API: o Node o grava em /app, a que aceita
# escrita, e o `check_report` e o conferidor o leem como o de uma suíte da API. A pasta dele nasce no
# `api_full`, que roda antes, porque o Node não a cria.
HARNESS_REPORT=reports/harness/node-tests.json
# O dos testes em shell do harness, na mesma pasta e no mesmo formato. É outro arquivo porque quem o grava
# é o executor, na máquina (shell-tests.sh), e o do Node é gravado no contêiner: cada
# relatório tem um escritor só.
HARNESS_SHELL_REPORT=reports/harness/shell-tests.json

# Roda os testes do harness: os do conferidor e do renderizador do contrato e os das skills (o parser e a
# página do plano, por exemplo) no contêiner `api`, e as suítes em shell (os hooks, a trava do modo
# completo, os modos do verify.sh e as das skills) na máquina, pelo executor que grava o relatório delas. Os
# testes das skills são achados por skill-tests.sh, sem lista à mão: uma skill nova com um
# teste ao lado do script entra sozinha. Os dois relatórios passam pelo `check_report`, e um grupo que falha
# não impede o outro de rodar.
harness_tests() {
  local code=0
  local -a skill_node_tests skill_shell_tests
  mapfile -t skill_node_tests < <(.claude/skills/verificar/scripts/verify/skill-tests.sh cjs)
  mapfile -t skill_shell_tests < <(.claude/skills/verificar/scripts/verify/skill-tests.sh sh)
  # O repórter próprio grava o relatório no formato do Vitest, para o `check_report` e o conferidor
  # lerem; o repórter `spec` segue na saída, para quem lê o log. Os testes são os mesmos caminhos
  # relativos aqui e no /repo, então a lista sai daqui.
  node_in_api --test --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter=./.claude/skills/verificar/scripts/test/node-test-report.cjs --test-reporter-destination="/app/$HARNESS_REPORT" \
    scripts/test/*.test.cjs "${skill_node_tests[@]}" &&
    check_report api vitest "$HARNESS_REPORT" || code=1
  # As suítes em shell usam o `git` e o `jq`, que o contêiner não tem, e a trava é do verify.sh, que
  # roda na máquina: elas rodam aqui. O relatório é o que faz um caso delas provar um critério.
  .claude/skills/verificar/scripts/test/shell-tests.sh "apps/api/$HARNESS_SHELL_REPORT" scripts/test/*.test.sh "${skill_shell_tests[@]}" &&
    check_report api vitest "$HARNESS_SHELL_REPORT" || code=1
  return $code
}

# Falha, dizendo por quê, quando o ACCEPTANCE_BODY_FILE aponta para um arquivo que não existe. Sem
# a variável, não há corpo, e passa.
require_body() {
  [[ -z "${ACCEPTANCE_BODY_FILE:-}" || -f "$ACCEPTANCE_BODY_FILE" ]] ||
    fail "O corpo do pull request não foi encontrado em $ACCEPTANCE_BODY_FILE, o arquivo de ACCEPTANCE_BODY_FILE." \
      "salve o corpo do PR nesse arquivo, ou aponte a variável para o arquivo certo, e rode de novo."
}

# O arquivo de aceite citado na seção "Aceite" do corpo do pull request, lido pelo mesmo conferidor,
# com o corpo na entrada padrão. Não imprime nada quando não há corpo e quando a seção diz "nenhum".
cited_acceptance() {
  require_body && node_in_api .claude/skills/plan-ticket/scripts/check-acceptance.cjs --cited - "$TICKETS_DIR" <"${ACCEPTANCE_BODY_FILE:-/dev/null}"
}

# O commit mais recente de <commits> (um intervalo ou um ponto, como no `git log`) que criou o
# <arquivo>. O `--follow` segue o arquivo pelas renomeações: o commit que só o moveu (como o que levou
# os arquivos de aceite de docs/aceite/ para a pasta de cada ticket) não conta como o que o criou. Não
# imprime nada quando nenhum o criou, e falha quando o `git log` não lê o histórico.
# added_by <commits> <arquivo>
added_by() {
  local commits
  commits="$(git log --follow --diff-filter=A --format=%H "$1" -- "$2")" || return 1
  printf '%s' "${commits%%$'\n'*}"
}

# O commit de plano: o mais recente da branch que criou o arquivo de aceite, que é o plano em
# vigor. Não imprime nada quando nenhum commit da branch o criou (um ticket antigo, ou o plano ainda
# sem commit). Falha quando o `git log` não lê o histórico da branch.
# plan_commit <arquivo de aceite>
plan_commit() {
  added_by "$BASE_REF..${HEAD_REF:-HEAD}" "$1"
}

# O desvio do plano, pelo comando do /contrato, que acrescenta a visão ao contract-drift.txt da pasta do ticket, que o `run_full`
# apaga no começo. Só avisa: nunca falha.
contract_drift() {
  local file plan drift
  if [[ -n "$HEAD_REF" ]] && ! git rev-parse --verify --quiet "$HEAD_REF^{commit}" >/dev/null; then
    echo "HARNESS_HEAD_REF aponta \`$HEAD_REF\`, que não é um commit deste clone, e o desvio não foi conferido. Aponte o commit da branch, ou deixe a variável vazia para comparar com a pasta de trabalho."
  elif ! file="$(cited_acceptance)"; then
    echo "Não deu para ler a seção \"Aceite\" do corpo do PR, pelo motivo acima, e o desvio não foi conferido."
  elif [[ -z "$file" ]]; then
    echo "Não há commit de plano para comparar: o corpo do PR não cita, na seção \"Aceite\", um arquivo de aceite."
  elif ! plan="$(plan_commit "$file")"; then
    echo "Não deu para ler o histórico da branch ($BASE_REF..${HEAD_REF:-HEAD}) com o \`git log\`, e o desvio não foi conferido. Confira se a base existe (\`git fetch origin\`, ou outra base em HARNESS_BASE_REF) e se o clone tem o histórico inteiro (\`git fetch --unshallow\`; na CI, \`fetch-depth: 0\` no checkout)."
  elif [[ -z "$plan" ]]; then
    echo "Não há commit de plano para comparar: nenhum commit desta branch criou o $file, citado na seção \"Aceite\" do corpo do PR."
  else
    # A pasta do ticket (docs/tickets/<issue>/<ticket>/) é a do arquivo de aceite citado.
    drift="$(dirname "$file")/contract-drift.txt"
    "$CONTRACT_DRIFT" "$plan" "$HEAD_REF" "$drift" ||
      echo "::warning title=Desvio do contrato não conferido::O comando do desvio do contrato falhou, e o desvio não foi conferido (veja o log)."
  fi
  return 0
}

# Confere o aceite contra os relatórios que as apps declaram em <app>_reports: a seção "Aceite" do
# pull request e a cobertura dos critérios de todos os tickets. A seção só é exigida quando a
# branch altera código em apps/.
acceptance() {
  local mode=--optional app ref spec report body="${ACCEPTANCE_BODY_FILE:-}" specs=()
  # Conta também o que ainda não foi commitado: na máquina, o modo completo costuma rodar antes
  # do commit, e a tabela não pode passar como "não exigida" só por isso.
  if [[ -n "$body" ]] && [[ -n "$(git diff --name-only "$(git merge-base "$BASE_REF" HEAD)" -- apps/)" ||
    -n "$(git ls-files --others --exclude-standard -- apps/)" ]]; then
    mode=--required
  fi

  require_body || return

  # O conferidor roda no contêiner `api` (`node_in_api`), na raiz do /repo, e lê de lá os arquivos de
  # aceite, pela pasta dos tickets relativa a ela, e os relatórios, que as suítes gravam na pasta de
  # cada app, e os dos testes do harness (o do Node e o das suítes em shell), na da API. O corpo do PR,
  # que não está no repositório, vai pela entrada padrão. O relatório que falta o conferidor reprova,
  # dizendo qual; aqui sai também o que fazer.
  specs+=("vitest:/repo/apps/api/$HARNESS_REPORT" "vitest:/repo/apps/api/$HARNESS_SHELL_REPORT")
  for app in "${APPS[@]}"; do
    ref="${app}_reports[@]"
    for spec in "${!ref}"; do
      report="apps/$app/${spec#*:}"
      if [[ ! -f "$report" ]]; then
        printf '\nO relatório %s não existe.\n' "$report" >&2
        printf 'Como corrigir: a suíte que o grava não rodou ou parou antes: veja o passo dela acima e rode `.claude/skills/verificar/scripts/verify.sh full` de novo.\n' >&2
      fi
      specs+=("${spec%%:*}:/repo/$report")
    done
  done

  node_in_api .claude/skills/plan-ticket/scripts/check-acceptance.cjs "$mode" - "$TICKETS_DIR" "${specs[@]}" <"${body:-/dev/null}"
}

require_base() {
  git rev-parse --verify --quiet "$BASE_REF" >/dev/null ||
    abort "a referência \`$BASE_REF\` não existe neste clone." \
      "rode \`git fetch origin\`, ou aponte outra base com a variável HARNESS_BASE_REF."
}

secret_scan() {
  local extra=() mounts
  require_base
  # Num worktree, o histórico está no `.git` comum, fora da pasta montada; num repositório, não há extra.
  mounts="$(gitleaks_git_args)" ||
    abort "não deu para achar o .git comum deste checkout, que a varredura de segredos monta." \
      "confira se o repositório do Git está íntegro, com \`git status\`."
  [[ -z "$mounts" ]] || mapfile -t extra <<<"$mounts"
  docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/repo" "${extra[@]}" "$GITLEAKS_IMAGE" \
    git /repo --no-banner --redact --log-opts="$BASE_REF..HEAD"
}

# Resumo do conteúdo dos caminhos que a verificação lê, numa árvore do Git.
tree_state() {
  local path
  for path in "${VERIFIED_PATHS[@]}"; do
    git rev-parse --verify --quiet "$1:$path" || echo ausente
  done | sha256sum | cut -d' ' -f1
}

# O mesmo resumo, para a pasta de trabalho: é ela que o modo completo verifica. Usa um índice
# temporário, para contar o que ainda não foi commitado sem mexer no índice de quem trabalha.
worktree_state() {
  local dir tree
  dir="$(mktemp -d)" || return 1
  tree="$(
    export GIT_INDEX_FILE="$dir/index"
    git read-tree HEAD && git add -A -- "${VERIFIED_PATHS[@]}" && git write-tree
  )"
  rm -rf "$dir"
  [[ -n "$tree" ]] || return 1
  tree_state "$tree"
}

# Confere que o modo completo aprovou exatamente o que está no último commit.
approval() {
  if git diff --quiet "$BASE_REF...HEAD" -- "${VERIFIED_PATHS[@]}"; then
    echo "A branch não altera nada do que a verificação lê. Não precisa de aprovação."
    return 0
  fi

  local approved acceptance
  approved="$(sed -n 's/^state=//p' "$APPROVAL_FILE" 2>/dev/null)"
  acceptance="$(sed -n 's/^acceptance=//p' "$APPROVAL_FILE" 2>/dev/null)"

  if [[ -z "$approved" || "$approved" != "$(tree_state HEAD)" ]]; then
    echo "O modo completo não aprovou o conteúdo do último commit."
    return 1
  fi
  if [[ "$acceptance" != checked ]] && ! git diff --quiet "$BASE_REF...HEAD" -- apps/; then
    echo "O modo completo aprovou este conteúdo, mas sem conferir o aceite, e a branch altera código em apps/."
    return 1
  fi
  echo "O modo completo aprovou o conteúdo do último commit."
}

run_prepush() {
  require_base
  step "Segredos nos commits da branch" \
    "tire o segredo do código e reescreva o commit que o trouxe. Ele ainda não saiu da máquina." \
    secret_scan
  step "Aprovação do modo completo" \
    "faça o commit de tudo, salve o corpo do pull request num arquivo e rode \`ACCEPTANCE_BODY_FILE=<arquivo> .claude/skills/verificar/scripts/verify.sh full\`. Se mudar algo em ${VERIFIED_PATHS[*]} depois, rode de novo." \
    approval
}

# O veredito: o grupo completo de todas as apps, mais o que atravessa as apps.
run_full() {
  local app
  require_base
  # Um `full` por vez na máquina, fora da CI. A espera vem antes de resumir o estado da pasta e de apagar a
  # aprovação anterior: ela não é um passo, e a aprovação tem de valer para a pasta que foi verificada.
  if full_lock_enabled; then
    full_semaphore_acquire "${HARNESS_DIR%/.harness}" "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')" ||
      abort "não deu para pegar a trava da máquina do modo completo." \
        "confira se o \`flock\` (o pacote util-linux) está instalado e se a pasta harness/ do .git comum deste repositório aceita escrita."
  fi
  # O estado é resumido antes de tudo, para a aprovação valer para o que foi verificado, e não
  # para o que estiver na pasta quando a verificação terminar.
  verified_state="$(worktree_state)" || abort "não deu para resumir o estado da pasta de trabalho." \
    "confira se o repositório do Git está íntegro, com \`git status\`."
  # A visão do desvio também é desta execução: uma interrompida não deixa uma antiga para trás.
  rm -f "$APPROVAL_FILE" "$TICKETS_DIR"/*/*/contract-drift.txt

  for app in "${APPS[@]}"; do
    "${app}_full"
  done

  step "Testes do harness" \
    "corrija o script ou o teste que falhou, em \`scripts/\` ou nas pastas \`scripts/\` e \`hooks/\` de uma skill (os testes dela ficam na pasta \`test/\` ao lado), e rode \`.claude/skills/verificar/scripts/verify.sh full\` de novo." \
    harness_tests

  # A cobertura dos critérios roda sempre. A seção "Aceite" só é conferida quando há um corpo de
  # pull request: na CI, ou na máquina, com o corpo num arquivo apontado por ACCEPTANCE_BODY_FILE.
  step "Aceite" \
    "acerte a seção \"Aceite\" do corpo do pull request, no formato do AGENTS.md da raiz, ou escreva o teste do critério que falta, com o ID numa tag." \
    acceptance

  # Depois do "Aceite", que confere a seção que ele lê. Só avisa: nunca entra nas falhas.
  step "Contrato e schema contra o commit de plano" \
    "o passo só avisa e não falha." \
    contract_drift

  step "Segredos nos commits da branch" \
    "tire o segredo do código, troque-o na origem (ele já vazou para o histórico) e reescreva o commit que o trouxe." \
    secret_scan
}

# O atalho do modo `plan`: o plan-page.sh da skill de plano, com os valores deste projeto. O dono dos
# valores é o AGENTS.md da raiz ("Plano do ticket", "Valores das skills do ticket"); o atalho só os passa.
# A lógica e as mensagens são do script.
# run_plan <pai> <ticket> [<commit>]
run_plan() {
  local args=(
    --pai "$1" --ticket "$2" --tickets "$TICKETS_DIR" --documentos docs
    --node "$CONTRACT_NODE" --contrato .claude/skills/contrato/scripts/contract-view.sh
    --contrato-arquivos "$API_SNAPSHOT $API_SCHEMA"
  )
  [[ -n "${3:-}" ]] && args+=(--commit "$3")
  "$PLAN_SKILL_SCRIPTS/plan-page.sh" "${args[@]}"
}

mode="${1:-}"
[[ $# -gt 0 ]] && shift

# As apps citadas no `full`. Sem nenhuma, ele é o veredito.
apps=()
# Se esta execução conta na trava das reprovações repetidas: só o `full` sem apps, fora da CI.
lock=no

case "$mode" in
  fast)
    apps=("$@")
    [[ ${#apps[@]} -eq 0 ]] && apps=("${APPS[@]}")
    check_apps "${apps[@]}"
    for app in "${apps[@]}"; do
      "${app}_fast"
    done
    apps=()
    ;;
  full)
    for arg in "$@"; do
      case "$arg" in
        --start-apps) START_APPS=yes ;;
        -*) usage ;;
        *) apps+=("$arg") ;;
      esac
    done
    if [[ ${#apps[@]} -eq 0 ]]; then
      # A trava vale só aqui, e fora da CI. Travado, recusa antes de tudo: rodar de novo não traz
      # informação nova.
      require_state
      full_lock_enabled && lock=yes
      [[ $lock == yes ]] && full_lock_active &&
        abort "o modo completo está travado: reprovou $FULL_LOCK_LIMIT vezes seguidas nos mesmos passos." "$FULL_LOCK_ASK"
      run_full
    else
      check_apps "${apps[@]}"
      for app in "${apps[@]}"; do
        "${app}_full"
      done
    fi
    ;;
  prepush)
    [[ $# -eq 0 ]] || usage
    require_state
    run_prepush
    ;;
  unlock)
    # Do usuário, pelo `!` do prompt, que não passa pelos hooks: o hook do agente nega este modo.
    [[ $# -eq 0 ]] || usage
    require_state
    full_lock_reset
    printf 'Trava do modo completo tirada, e a contagem zerada.\n'
    exit 0
    ;;
  apps)
    [[ $# -eq 0 ]] || usage
    printf '%s\n' "${APPS[@]}"
    exit 0
    ;;
  plan)
    # A página não é verificação: não aprova nada.
    plan_example='.claude/skills/verificar/scripts/verify.sh plan PROJ-1 PROJ-123 [<commit>]'
    [[ $# -ge 1 && $# -le 3 ]] || usage
    [[ $# -ge 2 ]] ||
      abort "falta o <pai> no \`plan\`: o comando é \`plan <pai> <ticket> [<commit>]\`, e só um argumento foi passado." \
        "passe a issue pai e o ticket, como em \`$plan_example\`."
    # A ordem de antes do <pai> (`plan <ticket> [<commit>]`) cai aqui: o primeiro não é issue, ou o segundo não é ticket.
    [[ "$1" =~ ^[A-Z][A-Z0-9]*-[0-9]+$ && "$2" =~ ^[A-Z][A-Z0-9]*-[0-9]+$ ]] ||
      abort "os argumentos de \`plan\` não são <pai> e <ticket>: o comando agora é \`plan <pai> <ticket> [<commit>]\`, com a issue pai antes do ticket." \
        "passe a issue pai e o ticket, os dois no formato PREFIXO-N, como em \`$plan_example\`."
    run_plan "$@"
    exit $?
    ;;
  *) usage ;;
esac

if [[ ${#failures[@]} -gt 0 ]]; then
  printf '\nREPROVADO: %d verificação(ões) falharam.\n' "${#failures[@]}" >&2
  for failure in "${failures[@]}"; do
    printf -- '- %s\n' "$failure" >&2
  done
  # A trava conta a reprovação pelos nomes dos passos que falharam.
  if [[ $lock == yes ]]; then
    names=()
    for failure in "${failures[@]}"; do
      names+=("${failure%%$'\n'*}")
    done
    count="$(full_lock_record_failure "${names[@]}")"
    if [[ "$count" -ge $FULL_LOCK_LIMIT ]]; then
      printf '\nTRAVADO: é a %dª reprovação seguida nos mesmos passos, e o modo completo travou. Até destravar, o `full` recusa rodar.\n' "$count" >&2
      printf 'Como resolver: %s\n' "$FULL_LOCK_ASK" >&2
    elif [[ "$count" -gt 1 ]]; then
      printf '\nÉ a %dª reprovação seguida nos mesmos passos. Na %dª, o modo completo trava: rode de novo só depois de corrigir a causa.\n' \
        "$count" "$FULL_LOCK_LIMIT" >&2
    fi
  fi
  exit 1
fi

if [[ ${#apps[@]} -gt 0 ]]; then
  printf '\nAPROVADO (%s %s).\n' "$mode" "${apps[*]}"
  printf 'Isto não libera o push: rode `.claude/skills/verificar/scripts/verify.sh full`, sem apps, antes de enviar.\n'
  exit 0
fi

# Registra o que o modo completo aprovou, para o hook de antes do push conferir.
if [[ "$mode" == full ]]; then
  mkdir -p "$(dirname "$APPROVAL_FILE")"
  printf 'state=%s\nacceptance=%s\n' "$verified_state" \
    "$([[ -n "${ACCEPTANCE_BODY_FILE:-}" ]] && echo checked || echo skipped)" >"$APPROVAL_FILE"
  [[ $lock == yes ]] && full_lock_reset
fi

printf '\nAPROVADO (%s).\n' "$mode"
