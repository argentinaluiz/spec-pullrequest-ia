# Aceite do LUI-174

Ticket de harness. O CA1 é provado por um teste de unidade do construtor da página, com o `node:test`, nos testes do harness. O CA2 é provado por demonstração no PR, numa branch descartável que não entra no merge, como no LUI-173. O CA3 é conferido pela leitura do diff. O desenho está no `docs/harness.md`, etapa 7, linha "Depois do commit de plano".

**Por que o negrito falha hoje.** O construtor separa o texto pelos trechos de código antes de procurar o negrito, então um `**...**` que contém um trecho de código fica partido em dois pedaços, e nenhum deles fecha o negrito. Aparece, por exemplo, na introdução do aceite do LUI-168 ("**Como o teste de API faz o `GET` da URL assinada.**").

**O cenário congelado que muda.** O LUI-173-CA6 diz que, depois do commit de plano, a pasta do ticket não tem `plano.msg` nem `plano.html`. Com este ticket, a página fica. O usuário descongela o `docs/aceite/LUI-173.md` e troca, no CA6, a falta da página pela página montada a partir do commit de plano, no PR deste ticket; a guarda do harness avisa da mudança.

## LUI-174-CA1

**Marca:** teste de unidade

**Cenário:** Dado um arquivo de aceite cuja introdução tem o parágrafo "**Como o teste faz o `GET` da URL.** O resto do parágrafo." e cujo cenário de um critério tem "**Atenção:** use `node:http`", quando o construtor monta a página, então os dois trechos saem em `<strong>`, com o `<code>` dentro do primeiro, e nenhum `**` sobra no HTML. Um `**` sem par continua como texto, e o código continua escapado.

**Teste previsto:** testes do harness, `scripts/test/plan-page.test.cjs`, "mostra em negrito o trecho que contém código, sem sobrar asteriscos @LUI-174-CA1".

## LUI-174-CA2

**Marca:** revisão humana

**Cenário:** Dado a branch de demonstração com o plano de exemplo `LUI-900` aprovado, quando se faz o commit de plano e o pós-commit como a skill de plano manda, então `docs/tickets/LUI-900/` tem só `plano.html`, e a linha de origem dela cita o commit de plano (e não o índice). A página é igual à que `scripts/verify.sh plan LUI-900 <commit de plano>` monta. E nem `git status --short` nem `git show --stat` do commit trazem nada de `docs/tickets/`.

## LUI-174-CA3

**Marca:** documento

**Cenário:** Dado a skill `/plan-ticket` e o `docs/harness.md` deste PR, quando se leem o passo do commit da skill e a linha "Depois do commit de plano" da etapa 7, então a skill manda, depois do commit, montar a página a partir do commit de plano e apagar só a mensagem proposta; e o harness diz que a página fica na pasta do ticket, fora do versionamento, citando o commit de plano, e que um plano refeito a sobrescreve. Nenhum dos dois cita a ferramenta de um agente.
