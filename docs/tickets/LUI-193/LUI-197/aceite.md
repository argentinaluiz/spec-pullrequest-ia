# Aceite do LUI-197

Ticket de harness e de texto de skill, sem mudança de comportamento: o ambiente (o Node no contêiner, os pontos de convergência, o teste do ambiente por slot e os procedimentos raros do Compose) vai para a skill do projeto `/ambiente`; a visão do contrato e do schema e o desvio desde o commit de plano vão para a skill do projeto `/contrato`, onde o desvio vira um comando próprio. Como as duas são skills do projeto, os testes que citam IDs deste projeto mantêm o ID na tag, e o mapa de testes não entra. Os testes dos scripts rodam na máquina, com o `docker` trocado por um falso (sem oasdiff nem contêiner), como os da verificação; o CA3 confere a função do `full` com os comandos trocados.

Decisões que os cenários supõem: o comando do Node passa a ser `.claude/skills/ambiente/scripts/node-in-api.sh`; o da visão do contrato, `.claude/skills/contrato/scripts/contract-view.sh <de> [<para>]`, que substitui o modo `contract` do `verify.sh`; o do desvio, `.claude/skills/contrato/scripts/contract-drift.sh <commit de plano> <para, ou vazio> <arquivo do desvio>`, que só avisa; o arquivo dos pontos de convergência passa para `.claude/skills/ambiente/`, e o script de frentes e a `/sincronizar` o leem de lá.

## LUI-197-CA1

**Marca:** teste de unidade

**Cenário:** Dado o comando do Node no caminho novo, quando ele recebe os argumentos do Node e uma entrada padrão, então chama o `node` no contêiner `api`, na raiz do repositório montado, repassa a entrada e sai com o código do Node; e quando o contêiner não está no ar, sai com 2 e diz como subir. Dado o comando da visão do contrato no caminho novo, quando recebe dois pontos do Git, então imprime a linha dos pontos e entrega ao renderizador, pela entrada padrão, os dois snapshots e o diff do schema; e recusa, com a mensagem, um ponto que não existe. Dado o atalho `plan` da verificação, quando monta a página do plano, então passa ao script da página o comando do Node e o da visão do contrato dos caminhos novos.

**Teste previsto:** testes dos scripts da skill `ambiente`, `node-in-api.test.sh`, "o Node roda no contêiner pelo caminho novo, repassa a entrada e diz como subir o ambiente @LUI-197-CA1"; testes dos scripts da skill `contrato`, `contract-view.test.sh`, "a visão do contrato é montada pelo comando do /contrato e recusa o ponto que não existe @LUI-197-CA1"; testes dos scripts da skill `verificar`, `verify-plan.test.sh`, "o atalho plan passa à página o Node e a visão do contrato das skills novas @LUI-197-CA1".

## LUI-197-CA2

**Marca:** teste de unidade

**Cenário:** Dado um repositório com um commit de plano, o snapshot da OpenAPI e o schema do Prisma, quando se roda o comando do desvio com esse commit, então: sem diferença, imprime que o contrato e o schema estão iguais ao planejado e não grava o arquivo do desvio; com o snapshot diferente, ou com o schema diferente, imprime e acrescenta ao arquivo a visão do desvio e emite o aviso `Contrato diferente do planejado`; e quando a visão não pode ser montada, grava e imprime o erro dela no lugar do desvio e avisa. Nos três casos sai com 0.

**Teste previsto:** testes dos scripts da skill `contrato`, `contract-drift.test.sh`, "o desvio desde o commit de plano imprime a visão do snapshot e do schema, diz quando não há desvio e só avisa @LUI-197-CA2".

## LUI-197-CA3

**Marca:** teste de unidade

**Cenário:** Dado o aviso de desvio do modo completo (`contract_drift` do `verify.sh`) com o comando do desvio trocado por um que registra a chamada, quando o corpo do PR cita um aceite e há commit de plano, então o aviso chama o comando uma vez, com o commit de plano, o `HARNESS_HEAD_REF` e o arquivo `contract-drift.txt` da pasta do ticket; e quando o comando sai com erro, o aviso devolve 0 mesmo assim, e o `full` não reprova por isso. O modo `review` chama o mesmo comando e leva o que ele disse para o arquivo do revisor.

**Teste previsto:** testes dos scripts da skill `verificar`, `contract-drift-warning.test.sh`, "o aviso de desvio do modo completo usa o comando do /contrato e só avisa @LUI-197-CA3".

## LUI-197-CA4

**Marca:** teste de unidade

**Cenário:** Dado o ambiente por slot, quando o teste dele roda no lugar novo, ao lado da configuração do Compose que ele confere, então o `.env` de cada slot, as portas e a recusa de um slot fora de 0 a 3 saem como antes. Dado o script de frentes lendo o arquivo dos pontos de convergência do lugar novo, quando lista os conflitos, então a classificação do tipo de cada arquivo (gerado, migrações, registros, documentos e manual) sai como antes.

**Teste previsto:** testes dos scripts da skill `ambiente`, `dev-env-slot.test.sh` (os casos do ambiente por slot, que mudam de pasta) e testes do script de frentes, `scripts/test/frentes.test.sh`, "o conflito em ponto de convergência com regra mecânica aparece à parte, com o tipo @LUI-197-CA4".

## LUI-197-CA5

**Marca:** documento

**Cenário:** Dado o `AGENTS.md` da raiz, quando se lê a seção "Execução no Docker", então ela mantém a regra (tudo roda no contêiner e o host é o nome do serviço), a tabela de serviços e os comandos de entrada (subir, derrubar, o banco e os e-mails), e aponta para a `/ambiente` nos procedimentos raros (recomeçar do zero, a API que não sobe); a `/ambiente` traz esses procedimentos. A lista "Valores das skills do ticket" aponta o comando do Node e o do contrato para as skills novas e traz o valor "Desvio do contrato".
