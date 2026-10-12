#!/usr/bin/env bash
#
# Guarda do harness. Lê, pela entrada padrão, os caminhos que um pull request altera (um por
# linha) e reprova quando algum deles é um arquivo protegido do harness. O desenho está no
# docs/harness.md.
#
# Quem chama é o workflow "Guarda do harness", que roda com a versão da `main` deste script,
# e não com a do pull request.
#
# Sai com 0 se nenhum arquivo protegido mudou, 1 se algum mudou e 2 se não deu para conferir.

set -uo pipefail

blocked=()
warned=()
total=0

while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  total=$((total + 1))
  case "$file" in
    # O que decide o veredito ou o que o agente pode fazer. Só muda por override do admin.
    .github/* | .claude/settings.json | .claude/hooks/* | scripts/*)
      blocked+=("$file")
      ;;
    # Configuração de lint e de teste: muda em tarefas normais, então só avisa.
    apps/api/.oxlintrc.json | apps/web/eslint.config.mjs | apps/api/vitest*.ts | \
      apps/web/playwright.config.ts | apps/*/tsconfig*.json)
      warned+=("$file")
      ;;
  esac
done

# Lista vazia é evidência ausente: um pull request sempre altera ao menos um arquivo.
if [[ $total -eq 0 ]]; then
  echo "::error title=Guarda do harness::A lista de arquivos alterados veio vazia. Sem ela, não dá para conferir o pull request."
  exit 2
fi

for file in "${warned[@]}"; do
  echo "::warning title=Configuração de verificação alterada::$file muda o que o lint ou os testes conferem. Leia essa mudança antes do merge."
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
