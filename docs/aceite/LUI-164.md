# Aceite do LUI-164

O conferidor do aceite lê relatórios no formato do Vitest e no do Playwright, e não olha de que suíte vêm: o ID no título do teste é a única ligação. Por isso a marca é uma promessa sobre o nível do teste, que o revisor lê, e não uma regra que a máquina impõe. Duas coisas chegam a ele neste ticket:

- **A suíte de unidade da web** grava `reports/unit.json` no contêiner `web`, em formato do Vitest, e entra na lista de relatórios da web (`web_reports`). O `verify.sh` já copia cada relatório de cada app para o conferidor, então o conferidor não muda para lê-la.
- **Os testes do harness**, que rodam com o `node:test`, passam a gravar um relatório no mesmo formato do Vitest, escrito por um repórter próprio do `node:test`, e o `verify.sh` o entrega ao conferidor ao lado dos relatórios das apps. Assim o conferidor continua com dois formatos, e o passo "Testes do harness" ganha a mesma conferência de relatório das suítes (ao menos um teste, nenhum pulado).

A marca "teste de integração" não pede relatório novo: a suíte de integração da API já grava `reports/int.json`, que o conferidor já lê. O que muda nele é só a lista de marcas aceitas, que passa a ter seis, das quais quatro exigem teste.

Os critérios CA1 e CA2 são provados pelos testes do conferidor, com o `node:test`, no mesmo formato dos que já existem em `scripts/test/check-acceptance.test.cjs`. Os critérios CA3 e CA4 se conferem lendo o `verify.sh` e rodando os comandos da suíte, e o CA5, lendo os documentos.

## LUI-164-CA1

**Marca:** teste de unidade

**Cenário:** Dado um arquivo de aceite com um critério de marca "teste HTTP" e um relatório de suíte da web, no formato do Vitest, com um teste que traz o ID do critério no título, quando o conferidor roda com esse relatório e o teste passou, então ele sai com 0 e diz que o critério está coberto. Dado o mesmo relatório com o teste falhado, quando o conferidor roda, então ele sai com 1 e diz que o teste com o ID falhou.

**Teste previsto:** testes do harness, `scripts/test/check-acceptance.test.cjs`, "confere o relatório da suíte de unidade da web: aceita o teste que passou e recusa o que falhou @LUI-164-CA1". Um teste a mais, sem ID, em `scripts/test/`, prova que o repórter do `node:test` grava o relatório no formato que o conferidor lê.

## LUI-164-CA2

**Marca:** teste de unidade

**Cenário:** Dado um arquivo de aceite com um critério de marca "teste de integração", quando o conferidor roda sem nenhum teste com o ID, então ele sai com 1 e a mensagem diz que o critério não tem teste. Quando roda com um teste com o ID que falhou ou foi pulado, sai com 1. Quando roda com um teste com o ID que passou, sai com 0 e conta o critério como coberto. E a marca "teste manual" continua sendo recusada, com a mensagem listando as seis marcas.

**Teste previsto:** testes do harness, `scripts/test/check-acceptance.test.cjs`, "aceita a marca teste de integração e exige o teste com o ID que rodou e passou @LUI-164-CA2".

## LUI-164-CA3

**Marca:** revisão humana

**Cenário:** Dado o `scripts/verify.sh full`, quando se lê o grupo da web em `scripts/verify/web.sh` e o `docs/harness.md`, então o grupo completo da web roda a suíte de unidade com o relatório em `reports/unit.json`, e confere o relatório com o mesmo `check_report` das outras suítes, que reprova relatório ausente, suíte vazia e teste pulado. A CI chama o mesmo comando. E, rodando o `full` com um teste da suíte falhando, ele reprova.

## LUI-164-CA4

**Marca:** revisão humana

**Cenário:** Dado o ambiente no ar, quando se roda no contêiner `web` os comandos da seção de testes de unidade do `apps/web/AGENTS.md` (todos os testes, um arquivo e um teste pelo nome), então cada um roda só o que pede, sem a aplicação no ar e sem navegador.

## LUI-164-CA5

**Marca:** documento

**Cenário:** Dado o `AGENTS.md` da raiz, o `apps/web/AGENTS.md` e o `docs/harness.md`, quando se lê a seção de marcas e a de testes da web, então o da raiz lista as seis marcas (e diz que quatro exigem teste), o da web descreve os dois níveis de teste e os comandos da suíte de unidade, e o do harness descreve a suíte e a marca nova, sem repetir uns os textos dos outros.
