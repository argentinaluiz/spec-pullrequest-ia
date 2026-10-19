#!/usr/bin/env bash
#
# O semáforo do modo completo: um `full` por vez entre todos os checkouts do repositório na máquina,
# porque vários rodando juntos disputam processador e memória, e uma falha por disputa reprovaria testes
# à toa. Quem carrega estas funções é o scripts/verify.sh, que descreve o comportamento no cabeçalho.
#
# As travas da máquina ficam na pasta `harness/` do `.git` comum, que todos os checkouts do repositório
# dividem e o Git ignora: `full.lock`, o alvo do `flock`, e `full.owner`, em texto, com o checkout, a
# branch, o PID e a hora de início do `full` em andamento.
#
# A trava é um descritor de arquivo do processo que chamou. Os passos da verificação rodam sem o
# descritor (`full_semaphore_unheld`, no `step`), então um processo que sobreviva a um `full` morto não a
# segura, e ela sai quando o `full` termina, até morto à força. Os filhos curtos fora dos passos a herdam. A
# espera consulta a trava a cada `FULL_SEMAPHORE_POLL` segundos (1 por padrão) em vez de ficar bloqueada
# num `flock`, para um `full` interrompido na espera não deixar processo para trás.

# A pasta das travas da máquina, que o script de frentes reaproveita.
full_semaphore_dir() {
  echo "$(git rev-parse --path-format=absolute --git-common-dir)/harness"
}

# full_semaphore_acquire <raiz do checkout> <branch>: espera a vez e pega a trava, dizendo de quem
# espera, e grava o dono. Sai com 2 se não há `flock` ou se a trava não pôde ser aberta ou consultada.
full_semaphore_acquire() {
  local root="$1" branch="$2" dir waited=no code
  command -v flock >/dev/null || return 2
  dir="$(full_semaphore_dir)" && mkdir -p "$dir" || return 2
  exec {FULL_SEMAPHORE_FD}>>"$dir/full.lock" || return 2
  while true; do
    flock -n -E 200 "$FULL_SEMAPHORE_FD"
    code=$?
    [[ $code -eq 0 ]] && break
    [[ $code -eq 200 ]] || return 2
    if [[ $waited == no ]]; then
      waited=yes
      full_semaphore_say_owner "$dir/full.owner"
    fi
    sleep "${FULL_SEMAPHORE_POLL:-1}"
  done
  [[ $waited == no ]] || echo "É a vez deste checkout: o \`full\` começa."
  printf 'checkout=%s\nbranch=%s\npid=%s\nsince=%(%H:%M)T\n' "$root" "$branch" "$$" -1 >"$dir/full.owner"
}

# Roda o comando sem o descritor da trava: um filho que sobreviva ao processo não a segura.
# full_semaphore_unheld <comando...>
full_semaphore_unheld() {
  if [[ -n "${FULL_SEMAPHORE_FD:-}" ]]; then
    "$@" {FULL_SEMAPHORE_FD}>&-
  else
    "$@"
  fi
}

# Diz de quem é o `full` em andamento. O dono é gravado logo depois de pegar a trava, então pode faltar
# ou estar pela metade por um instante: a espera é dita do mesmo jeito, sem o dono.
# full_semaphore_say_owner <arquivo do dono>
full_semaphore_say_owner() {
  local key value checkout="" branch="" pid="" since="" who="noutro checkout deste repositório"
  while IFS== read -r key value; do
    case $key in
      checkout) checkout=$value ;;
      branch) branch=$value ;;
      pid) pid=$value ;;
      since) since=$value ;;
    esac
  done <"$1" 2>/dev/null
  [[ -z "$checkout" ]] || who="do checkout $checkout (${branch:-?}, PID ${pid:-?}, desde as ${since:-?})"
  echo "Aguardando a vez: o \`full\` $who está em andamento. Esta espera não conta como reprovação."
}
