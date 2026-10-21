#!/usr/bin/env bash
#
# Guarda do harness. Lê, pela entrada padrão, os caminhos que um pull request altera (um por
# linha) e reprova quando algum deles é um arquivo protegido do harness. Quais arquivos são
# protegidos não é daqui: vem da lista que quem chama passa, e o script não conhece nenhum arquivo
# de projeto.
#
# Quem chama é o workflow da Guarda, que roda com a versão da `main` deste script e da lista, e
# não com a do pull request.
#
#   harness-guard.sh <lista> [arquivos que o pull request diz alterar] < lista de caminhos
#
# A lista tem uma linha por padrão: o tipo, uma tabulação e o caminho, relativo à raiz do
# repositório. Linhas em branco e as que começam com `#` são ignoradas. No caminho, o `*` casa
# dentro de um nível de pasta e o `**` atravessa as barras. Vale o primeiro padrão que casa; um
# caminho que nenhum casa passa. Os tipos:
#
#   bloqueado   só entra por override do admin
#   aviso       avisa, sem bloquear
#   congelado   avisa quando um arquivo que já existe no diretório atual (a `main`) muda
#   comandos    bloqueia quando a seção `scripts` de um manifesto de pacote muda; só avisa sem HEAD_DIR
#
# Sai com 0 se nenhum arquivo protegido mudou, 1 se algum mudou e 2 se não deu para conferir (lista
# ausente, ilegível ou inválida, lista de caminhos vazia ou arquivos demais para a API).

set -uo pipefail

# A API do GitHub lista no máximo este número de arquivos por pull request.
API_FILE_LIMIT=3000

list="${1:-}"
if [[ -z "$list" || ! -r "$list" || ! -f "$list" ]]; then
  echo "::error title=Guarda do harness::A lista de arquivos protegidos não foi passada ou não se lê (${list:-sem caminho}). Sem ela, não dá para conferir o pull request."
  exit 2
fi

# Quantos arquivos o pull request diz alterar. Vem do workflow, e é opcional na máquina.
declared="${2:-}"
if [[ -n "$declared" && ! "$declared" =~ ^[0-9]+$ ]]; then
  echo "::error title=Guarda do harness::O total de arquivos do pull request (\"$declared\") não é um número. Sem ele, não dá para saber se a lista de arquivos está inteira."
  exit 2
fi
if [[ -n "$declared" && "$declared" -ge "$API_FILE_LIMIT" ]]; then
  echo "::error title=Guarda do harness::O pull request altera $declared arquivos, e a API só lista $API_FILE_LIMIT. Um arquivo protegido poderia ficar fora da lista."
  echo "Como resolver: divida o pull request, ou o admin confere os arquivos protegidos à mão e faz o merge com bypass."
  exit 2
fi

# O padrão da lista como expressão regular inteira (`pattern_regex`), com o significado único do padrão de caminho.
# shellcheck source=path-pattern.sh
source "$(dirname "${BASH_SOURCE[0]}")/path-pattern.sh"

# Lê a lista: os tipos e as expressões, na ordem em que aparecem.
types=()
regexes=()
line_number=0
while IFS= read -r line || [[ -n "$line" ]]; do
  line_number=$((line_number + 1))
  [[ -z "${line//[[:space:]]/}" || "$line" == \#* ]] && continue
  type="${line%%$'\t'*}"
  path="${line#*$'\t'}"
  if [[ "$line" != *$'\t'* || -z "$path" ]]; then
    echo "::error title=Guarda do harness::A lista $list tem a linha $line_number sem tipo e caminho separados por uma tabulação."
    exit 2
  fi
  case "$type" in
    bloqueado | aviso | congelado | comandos) ;;
    *)
      echo "::error title=Guarda do harness::A lista $list tem na linha $line_number o tipo desconhecido \"$type\" (os tipos são bloqueado, aviso, congelado e comandos)."
      exit 2
      ;;
  esac
  types+=("$type")
  regexes+=("$(pattern_regex "$path")")
done <"$list"

# Põe em `class` o tipo do primeiro padrão que casa com o caminho, ou nada. Não imprime, para o laço dos
# caminhos não criar um subshell por arquivo.
# classify <caminho>
classify() {
  local i
  class=""
  for i in "${!regexes[@]}"; do
    if [[ "$1" =~ ${regexes[i]} ]]; then
      class="${types[i]}"
      return 0
    fi
  done
}

# Os comandos do manifesto de pacote são o que a verificação chama: trocar um deles por um comando que
# sempre passa a enfraquece. Compara a seção `scripts` da versão da `main`, que é a do diretório atual,
# com a do pull request, que o workflow baixa em $HEAD_DIR. Sem $HEAD_DIR, como na máquina, não há o que
# comparar, e o arquivo só gera aviso.
scripts_changed() {
  local file="$1"
  [[ -z "${HEAD_DIR:-}" ]] && return 1
  # Arquivo criado, apagado ou renomeado: não dá para comparar, então conta como mudança.
  [[ -f "$file" && -f "$HEAD_DIR/$file" ]] || return 0
  # Um manifesto que o `jq` não lê (ou a falta do `jq`) também conta como mudança: dois erros iguais não
  # provam que os comandos são os mesmos.
  local base head
  base="$(jq -S '.scripts // {}' "$file" 2>/dev/null)" || return 0
  head="$(jq -S '.scripts // {}' "$HEAD_DIR/$file" 2>/dev/null)" || return 0
  [[ "$base" != "$head" ]]
}

blocked=()
warned=()
frozen=()
total=0

while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  total=$((total + 1))
  classify "$file"
  case "$class" in
    bloqueado) blocked+=("$file") ;;
    aviso) warned+=("$file") ;;
    # Descongelar é legítimo quando um ticket muda um comportamento já entregue, e o humano que faz o
    # merge é quem decide: por isso só avisa. Criar um arquivo novo não conta.
    congelado) [[ -f "$file" ]] && frozen+=("$file") ;;
    comandos)
      if scripts_changed "$file"; then
        blocked+=("$file (seção scripts)")
      else
        warned+=("$file")
      fi
      ;;
  esac
done

# Lista vazia é evidência ausente: um pull request sempre altera ao menos um arquivo.
if [[ $total -eq 0 ]]; then
  echo "::error title=Guarda do harness::A lista de arquivos alterados veio vazia. Sem ela, não dá para conferir o pull request."
  exit 2
fi

for file in "${warned[@]}"; do
  echo "::warning title=Arquivo em aviso alterado::$file está na lista de arquivos protegidos como aviso. Leia essa mudança antes do merge."
done

for file in "${frozen[@]}"; do
  echo "::warning title=Aceite congelado alterado::$file já existe na main e foi alterado, renomeado ou apagado. Confira no merge que foi o humano quem o descongelou."
done

if [[ ${#blocked[@]} -gt 0 ]]; then
  for file in "${blocked[@]}"; do
    echo "::error title=Arquivo protegido do harness::$file só muda por override do admin."
  done
  echo
  echo "REPROVADO: este pull request altera ${#blocked[@]} arquivo(s) protegido(s) do harness."
  echo "Como resolver: se a mudança no harness é intencional, o admin lê o diff desses arquivos e faz o merge com bypass. Se não é, tire esses arquivos do pull request."
  exit 1
fi

echo "APROVADO: nenhum arquivo protegido do harness entre os $total alterados."
