# Aceite do LUI-198

Ticket de harness e de texto de skill: a revisão de conformidade passa a funcionar em qualquer projeto. A preparação dos insumos deixa o `verify.sh` (o modo `review` sai) e vira um script da própria skill `/revisao-conformidade`; o modelo do revisor passa a morar na skill, sem dado deste projeto, e o projeto instala uma cópia entre os agentes dele; o texto da skill lê os valores no passo 0, com os padrões, na forma da `/plan-ticket`. O CA1 e o CA2 são provados por testes de unidade do script dos insumos, que mora numa skill de uso geral e por isso se liga aos critérios pelo mapa de testes do ticket (`mapa-de-testes.txt`, gravado na implementação pelo procedimento da `/plan-ticket`); o CA3 ao CA5 são lidos nos textos.

Decisões que os cenários supõem: o script dos insumos é `scripts/review-inputs.sh` da skill e recebe, por opção, a pasta dos tickets (`--tickets`, padrão `docs/tickets`), a base (`--base`, padrão o ramo principal do remoto de origem, `origin/<ramo>`, ou `origin/main` se o remoto não diz) e o comando do desvio do contrato (`--desvio`, padrão nenhum), chamado como `<comando> <commit de plano> <para, ou vazio> <arquivo do desvio>`, o mesmo que o comando do `/contrato` aceita; o modelo do revisor é `revisor.md`, na pasta da skill, e a cópia instalada do projeto é esse texto com o cabeçalho do agente e a ferramenta do Linear, e é a que roda; sem o subagente instalado, a skill usa o modelo numa sessão nova.

## LUI-198-CA1

**Marca:** teste de unidade

**Cenário:** Dado um repositório com uma base, uma branch com o commit de plano de um ticket, uma mudança em arquivo versionado, um arquivo novo (também com espaço no nome e já em commit) e um arquivo apagado, quando se roda o script dos insumos com a pasta do ticket, então ele grava na pasta do ticket o `review.diff` com tudo isso desde o ponto em que a branch saiu da base (sem trazer a mudança alheia que entrou na base depois), a `plano.txt` com a mensagem do commit de plano e o `contract-drift.txt` com o que o comando do desvio disse, e imprime os caminhos e a lista dos arquivos que o diff acrescenta. Ele recusa, com código 2 e dizendo o que fazer, um ticket sem commit de plano, uma mudança sem ticket sem o `criterios.md`, e um insumo que o `.gitignore` não ignoraria; e quando o comando do desvio falha, o `contract-drift.txt` diz que o desvio não foi conferido, em vez de ficar vazio.

**Teste previsto:** testes dos scripts da skill `revisao-conformidade`, `review-inputs.test.sh`, "grava o diff desde a base com os arquivos novos, a mensagem do commit de plano e o desvio", "recusa um ticket sem commit de plano", "recusa uma mudança sem ticket sem critérios" e "recusa um insumo que o Git não ignoraria".

## LUI-198-CA2

**Marca:** teste de unidade

**Cenário:** Dado um repositório de fora, só com a cópia da skill, sem contrato, sem `apps/` e sem nenhum arquivo deste projeto, e uma branch com um commit de plano, quando se roda o script dos insumos sem `--base` e sem `--desvio`, então ele usa o `origin/main` como base (ou o ramo que o remoto de origem diz) e grava o `contract-drift.txt` dizendo que nenhum comando do desvio foi declarado; e com `--base` e `--desvio` dados, usa a base e chama o comando que recebeu.

**Teste previsto:** testes dos scripts da skill `revisao-conformidade`, `review-inputs.test.sh`, "roda num repositório de fora, com os padrões da base e do desvio".

## LUI-198-CA3

**Marca:** documento

**Cenário:** Dado a skill `/revisao-conformidade` e a pasta de agentes do projeto, quando se lê o modelo do revisor (`revisor.md`) e a cópia instalada (`.claude/agents/revisor-conformidade.md`), então o modelo não cita arquivo, seção de documento, comando nem ferramenta deste projeto (as regras do projeto são citadas pelo papel), e a cópia instalada é o texto do modelo com o cabeçalho do agente e a ferramenta do Linear, e nada mais; um teste confere que a cópia é o modelo.

## LUI-198-CA4

**Marca:** documento

**Cenário:** Dado o modelo do revisor, quando se lê as conferências que só ele faz, então ele manda conferir as linhas do mapa de testes que o diff traz como confere as tags, e julgar se o caso ligado prova o critério, e não só se o caso existe.

## LUI-198-CA5

**Marca:** documento

**Cenário:** Dado o `SKILL.md` da `/revisao-conformidade`, quando se lê o passo 0, então ele lê, na lista "Valores das skills do ticket" do `AGENTS.md`, a pasta dos tickets, a base, o código que pede revisão (padrão: toda mudança fora de documento), o revisor e o desvio do contrato, cada um com o padrão, anuncia os que vieram do padrão e pula o que usa um valor `nenhum`; e o texto não cita caminho, seção do `AGENTS.md` nem remoto deste projeto. O `AGENTS.md` declara os valores deste projeto, com o desvio apontando para o `/contrato`.
