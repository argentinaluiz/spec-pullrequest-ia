# Aceite do LUI-175

Ticket de harness. O CA1 e o CA2 são provados por testes de unidade com o `node:test`, nos testes do harness: o parser e o construtor da página recebem texto e devolvem dados ou HTML, sem `git`. Os de revisão humana são provados por demonstração no PR, numa branch descartável e, no CA5, num repositório de exemplo fora deste, como no LUI-173. O CA7 é conferido pela leitura do diff. O desenho está no `docs/harness.md`, etapa 7.

**A interface da skill com o projeto.** O script da página da skill recebe por argumento o ticket, a pasta dos aceites, a pasta dos tickets, o comando do Node e o comando do contrato (ou `nenhum`), e opcionalmente o commit de plano. O comando do Node é chamado como `<comando> <script> <argumentos>`, com os caminhos relativos à raiz do repositório e o HTML na saída padrão. O comando do contrato é chamado como `<comando> <de> <até>`, com dois pontos do Git (um commit, ou a árvore do índice), e imprime Markdown. Neste projeto, os valores ficam no `AGENTS.md`, "Plano do ticket", e o comando do Node leva os arquivos ao contêiner `api`.

**Por que o modo `plan` do script de verificação fica.** Os cenários congelados do LUI-173 (CA4 e CA5) e do LUI-174 (CA2) citam `scripts/verify.sh plan <ticket> [<commit>]`. O modo continua, como um atalho que só chama o script da skill com os valores deste projeto, e a lógica sai dele. Assim nenhum aceite congelado muda.

**Por que a mesma página.** Neste projeto, a página que sai pelos scripts da skill tem de ser a mesma que o modo atual monta. A aba Contrato muda de fonte (o Markdown do comando do projeto, em vez do modelo das rotas), mas mostra as mesmas rotas, com as mesmas tabelas.

## LUI-175-CA1

**Marca:** teste de unidade

**Cenário:** Dado um arquivo de aceite com uma introdução, um critério de teste com um subtítulo antes da marca e um critério de documento, e uma mensagem de commit de plano com um `Decision:` de dois parágrafos, a lista de arquivos depois de uma linha em branco e as linhas de atribuição, quando o parser da skill os lê, então devolve a introdução, para cada ID a marca, o cenário e o teste previsto (nulo no de documento), e os blocos da mensagem inteiros, sem as linhas de atribuição: o mesmo resultado que o parser atual devolve para as mesmas entradas. E, quando o conferidor do aceite roda contra um relatório em que o teste do critério passou, então ele importa o parser de dentro da pasta da skill e aprova; com o teste ausente, reprova pelo critério.

**Teste previsto:** testes do harness, `.claude/skills/plan-ticket/scripts/test/plan.test.cjs`, "lê o aceite e a mensagem como o parser do conferidor, que o importa da skill @LUI-175-CA1".

## LUI-175-CA2

**Marca:** teste de unidade

**Cenário:** Dado um Markdown de contrato com um título de seção, uma tabela de três colunas (com uma barra vertical escapada numa célula e um trecho de código), uma lista e um bloco de código, quando o construtor monta a página com ele, então a aba Contrato traz o título, a tabela com as três colunas e a barra como texto, a lista e o bloco de código, tudo escapado. Dado o mesmo plano sem Markdown de contrato, porque o projeto declarou `nenhum`, quando o construtor monta a página, então a aba Contrato diz que o projeto não declara contrato.

**Teste previsto:** testes do harness, `.claude/skills/plan-ticket/scripts/test/page.test.cjs`, "monta a aba Contrato do Markdown recebido, ou diz que o projeto não declara contrato @LUI-175-CA2".

## LUI-175-CA3

**Marca:** revisão humana

**Cenário:** Dado o script da página da skill, quando ele roda sem `--node`, depois sem `--contrato` e depois sem `--aceite`, então cada execução sai com código diferente de zero e diz qual argumento falta e que o projeto o declara no `AGENTS.md`, na lista da skill de plano.

## LUI-175-CA4

**Marca:** revisão humana

**Cenário:** Dado o plano de exemplo `LUI-900` numa branch descartável, montado antes da mudança pelo modo atual, quando o mesmo plano é montado pelos scripts da skill, com os valores do `AGENTS.md`, e pelo atalho `scripts/verify.sh plan LUI-900`, então as três páginas são iguais, salvo a linha de origem. E o commit de plano feito com `git commit -F` sai com a mesma mensagem e os mesmos arquivos.

## LUI-175-CA5

**Marca:** revisão humana

**Cenário:** Dado um repositório de exemplo fora deste, sem Docker, sem contrato e só com a pasta da skill copiada e um `AGENTS.md` mínimo que declara as pastas, o Node como `node` e o contrato como `nenhum`, quando o agente segue a skill até a parada, então a página é gravada com o Node da máquina, a aba Contrato diz que o projeto não declara contrato, e as abas Aceite, Documentos, Arquivos e interfaces e Decisões saem preenchidas.

## LUI-175-CA6

**Marca:** revisão humana

**Cenário:** Dado a guarda do harness deste PR, quando ela confere uma lista de arquivos alterados com `.claude/skills/plan-ticket/scripts/plan.cjs`, então reprova, citando o arquivo protegido. Quando confere uma lista só com `.claude/skills/plan-ticket/SKILL.md` e um arquivo de `.claude/skills/plan-ticket/formatos/`, então aprova.

## LUI-175-CA7

**Marca:** documento

**Cenário:** Dado a skill de plano, o `AGENTS.md` da raiz, o `docs/lld.md` e o `docs/harness.md` deste PR, quando são lidos, então a skill traz os formatos do aceite, da mensagem do commit de plano e do contrato de rota e de tabela, e o passo de perguntar e ajudar a definir um contrato quando o projeto não declara um; o `AGENTS.md`, em "Plano do ticket", declara os valores do projeto e aponta para os formatos da skill, sem repeti-los; as seções 2 e 3 do LLD apontam para os formatos da skill e ficam só com o que é deste projeto; e o `docs/harness.md` descreve o parser importado da skill, a proteção da pasta de scripts dela e o atalho `plan`.
