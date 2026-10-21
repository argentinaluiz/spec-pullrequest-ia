#!/usr/bin/env bash
#
# Testes dos argumentos e da pasta do ticket do script da página do plano
# (plan-page.sh, desta skill): o `--pai` obrigatório e validado, os valores do projeto lidos do
# `.config/project`, a página gravada em <tickets>/<pai>/<ticket>/ e as regras do .gitignore na profundidade
# nova. O script roda num repositório temporário, com um comando do Node de mentira. Rodam na máquina, como o script, porque ele usa o `git` e o
# `bash`. Os casos de aceite se ligam aos critérios pelo mapa de testes do ticket, e não pelo nome.

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../plan-page.sh"
# shellcheck source=helpers.sh
source "$HERE/helpers.sh"

project="$(mktemp -d)"
trap 'rm -rf "$project"' EXIT
git -C "$project" init -q
git -C "$project" config user.email t@t
git -C "$project" config user.name t
printf '%s\n' 'docs/tickets/*/*/*' '!docs/tickets/*/*/aceite.md' '!docs/tickets/*/*/mapa-de-testes.txt' >"$project/.gitignore"
echo x >"$project/a.txt"
git -C "$project" add -A
git -C "$project" -c commit.gpgsign=false -c core.hooksPath=/dev/null commit -q -m base || exit 2

# O comando do Node de mentira: lê as fontes e imprime uma página mínima.
fake_node="$project/fake-node.sh"
printf '#!/usr/bin/env bash\ncat >/dev/null\necho "<html>página</html>"\n' >"$fake_node"
chmod +x "$fake_node"

# config <linhas...>: grava o .config/project do projeto temporário com as linhas dadas, na sintaxe do `git config`.
mkdir -p "$project/.config"
config() {
  printf '%s\n' "$@" >"$project/.config/project"
}
# Os valores de sempre: a pasta dos tickets e o Node de mentira, sem contrato.
default_config() {
  config '[tickets]' 'pasta = docs/tickets' '[node]' "comando = $fake_node"
}
default_config

# plan <argumentos...>: roda o script no projeto temporário, e deixa a saída de erro em $err e o código em $code.
plan() {
  err="$(cd "$project" && "$SCRIPT" "$@" 2>&1 >/dev/null)"
  code=$?
}

contains() {
  [[ "$err" == *"$1"* ]]
}

plan --ticket PROJ-2
check "recusa a chamada sem o --pai, dizendo qual argumento falta" test $code -eq 2 -a -n "$err"
check "a mensagem de quando falta o --pai o nomeia" contains "--pai"

plan --pai pai --ticket PROJ-2
check "recusa um --pai que não tem a forma PREFIXO-N" test $code -eq 2
check "a mensagem do --pai inválido o cita" contains '`pai`'

plan --pai PROJ-1 --ticket PROJ-2
check "sem a mensagem proposta, para pedindo a mensagem na pasta da issue pai e do ticket" test $code -eq 1
check "a mensagem proposta é esperada em <tickets>/<pai>/<ticket>/plano.msg" contains "docs/tickets/PROJ-1/PROJ-2/plano.msg"

mkdir -p "$project/docs/tickets/PROJ-1/PROJ-2"
echo "docs: plan x (PROJ-2)" >"$project/docs/tickets/PROJ-1/PROJ-2/plano.msg"
plan --pai PROJ-1 --ticket PROJ-2
check "monta a página na pasta do ticket, dentro da pasta da issue pai" test $code -eq 0 -a -f "$project/docs/tickets/PROJ-1/PROJ-2/plano.html"

# O .gitignore de antes da pasta da issue pai ignora a pasta do ticket inteira, aceite incluído.
printf '%s\n' 'docs/tickets/*/*' '!docs/tickets/*/aceite.md' >"$project/.gitignore"
plan --pai PROJ-1 --ticket PROJ-2
check "recusa o .gitignore da profundidade antiga: a regra da pasta ignora o aceite" test $code -eq 2
check "a mensagem diz que o aceite é ignorado" contains 'ignora o docs/tickets/PROJ-1/PROJ-2/aceite.md'
check "a mensagem manda trocar a regra obsoleta da pasta" contains 'troque a regra que ignora a própria pasta'
check "a mensagem traz as regras da profundidade nova" contains '`docs/tickets/*/*/*`, `!docs/tickets/*/*/aceite.md` e `!docs/tickets/*/*/mapa-de-testes.txt`'

# Sem nenhuma regra, a página e a mensagem seriam versionadas: é a outra recusa.
: >"$project/.gitignore"
plan --pai PROJ-1 --ticket PROJ-2
check "recusa o .gitignore que não ignora a página do ticket" test $code -eq 2
check "a mensagem diz qual arquivo não é ignorado" contains 'não ignora o docs/tickets/PROJ-1/PROJ-2/plano.html'
check "a mensagem pede as linhas novas" contains 'acrescente ao .gitignore as linhas'

# As regras novas passam de novo.
printf '%s\n' 'docs/tickets/*/*/*' '!docs/tickets/*/*/aceite.md' '!docs/tickets/*/*/mapa-de-testes.txt' >"$project/.gitignore"
plan --pai PROJ-1 --ticket PROJ-2
check "aceita as regras da profundidade nova" test $code -eq 0

# O mapa de testes do ticket é versionado como o aceite: um .gitignore que só versiona o aceite é recusado.
printf '%s\n' 'docs/tickets/*/*/*' '!docs/tickets/*/*/aceite.md' >"$project/.gitignore"
plan --pai PROJ-1 --ticket PROJ-2
check "o script exige que o mapa de testes do ticket não seja ignorado" test $code -eq 2
check "a mensagem diz que o mapa de testes é ignorado" contains 'ignora o docs/tickets/PROJ-1/PROJ-2/mapa-de-testes.txt'
check "a mensagem pede a linha que versiona o mapa" contains '`!docs/tickets/*/*/mapa-de-testes.txt`'
printf '%s\n' 'docs/tickets/*/*/*' '!docs/tickets/*/*/aceite.md' '!docs/tickets/*/*/mapa-de-testes.txt' >"$project/.gitignore"
plan --pai PROJ-1 --ticket PROJ-2
check "o script monta a página quando o aceite e o mapa de testes são versionados" test $code -eq 0

# As mensagens de erro são de uma skill genérica: falam do arquivo de instruções do agente do projeto, e não
# do nome que este projeto dá a ele.
lacks() {
  [[ "$err" != *"$1"* ]]
}
fail_cmd="$project/fail-cmd.sh"
printf '#!/usr/bin/env bash\nexit 1\n' >"$fail_cmd"
chmod +x "$fail_cmd"

rm -f "$project/.config/project"
plan --pai PROJ-1 --ticket PROJ-2
check "recusa a chamada sem os valores do projeto" test $code -eq 2
check "a mensagem aponta para o arquivo de configuração do projeto" contains '.config/project'
check "a mensagem diz as chaves que faltam" contains 'tickets.pasta'
check "a mensagem de um valor que falta não cita o nome do arquivo do projeto" lacks "AGENTS.md"

config '[tickets]' 'pasta = docs/tickets' '[node]' "comando = $fake_node" '[contrato]' "comando = $fail_cmd"
plan --pai PROJ-1 --ticket PROJ-2
check "recusa o comando do contrato sem os arquivos do contrato" test $code -eq 2
check "a mensagem diz que faltam os arquivos do contrato" contains 'contrato.arquivos'

plan --tickets docs/tickets --pai PROJ-1 --ticket PROJ-2
check "recusa um valor do projeto passado como argumento" test $code -eq 2
check "a mensagem diz que os valores do projeto vêm do arquivo de configuração" contains '.config/project'

config '[tickets]' 'pasta = docs/tickets' '[node]' "comando = $fake_node" '[contrato]' "comando = $fail_cmd" 'arquivos = x'
plan --pai PROJ-1 --ticket PROJ-2
check "recusa o comando do contrato que falha" test $code -eq 1
check "a mensagem diz que o comando do contrato falhou" contains 'falhou'
check "a mensagem manda acertar o valor no arquivo de configuração do projeto" contains '.config/project'
check "a mensagem do comando do contrato que falha não cita o nome do arquivo do projeto" lacks "AGENTS.md"

config '[tickets]' 'pasta = docs/tickets' '[node]' "comando = $fail_cmd"
plan --pai PROJ-1 --ticket PROJ-2
check "recusa o comando do Node que falha" test $code -eq 1
check "a mensagem diz que a página não pôde ser montada" contains 'não pôde ser montada'
check "a mensagem do Node manda acertar o valor no arquivo de configuração do projeto" contains '.config/project'
check "a mensagem do comando do Node que falha não cita o nome do arquivo do projeto" lacks "AGENTS.md"

finish "do script da página do plano"
