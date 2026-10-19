# Aceite do LUI-188

Ticket de skill: cria a `/sincronizar`, que traz a `main` do remoto para a branch de uma frente. O CA1 e o CA4 são de documento, lidos no diff (a skill e a seção do `AGENTS.md`). O CA2 e o CA3 são de revisão humana: exigem duas frentes de verdade, com o `full` rodando, e a evidência vai no PR. Não há teste de unidade, porque a skill é um conjunto de instruções para o agente, sem código, e o fluxo do ticket sem critério de teste não usa a `tdd`.

A skill é do projeto (`.claude/skills/sincronizar/`), no mesmo formato da `revisao-conformidade`. Ela é a dona dos passos e da regra de resolução de cada tipo de ponto de convergência; quais arquivos são de cada tipo é de `scripts/pontos-de-convergencia.txt`, que ela lê e não repete, e o semáforo do `full` e o passo da ordem das migrações são do `scripts/verify.sh`, que ela só chama.

## LUI-188-CA1

**Marca:** documento

**Cenário:** Dado o diff do PR, quando se lê a `.claude/skills/sincronizar/SKILL.md`, então ela descreve os nove passos na ordem do ticket (pasta limpa; buscar a main e listar o que entrou, lendo o corpo de cada PR mergeado e o arquivo de aceite do ticket dele, terminando se nada entrou; fazer o merge da main remota, sem rebase e sem push forçado; resolver os conflitos pela regra de cada tipo, conferindo que não sobrou marcador de conflito antes de pôr no índice e marcando quando a resolução mexeu em lógica; atualizar o ambiente da frente; comparar o que entrou com o que o ticket muda, adaptar e rodar os testes do que se cruza; rodar a `/code-review` só se a resolução ou a adaptação mexeu em lógica; commit do merge, `full` em segundo plano e push; relatar no chat e num comentário do PR). Diz a regra de cada tipo (gerado: regenerar a partir do código mergeado; migração da branch anterior à mais recente da main: recriar; registros: juntar os dois lados em ordem alfabética; documentos: juntar à mão e dizer no PR), lê a classificação do arquivo de dados e não a repete, diz o que a skill nunca faz (rebase, push forçado, merge de PR, mudança em arquivo de aceite) e quando para e pergunta (o que entrou contradiz um critério do ticket, ou a resolução exige uma decisão que não é do ticket).

## LUI-188-CA2

**Marca:** revisão humana

**Cenário:** Dado duas frentes abertas e o merge de um dos PRs na `main`, quando a outra frente roda a `/sincronizar`, então o relato lista o que entrou (os PRs e os critérios dos tickets deles), os conflitos e como foram resolvidos, o `full` passa e o PR da frente fica atualizado com a `main`. A evidência no PR traz o relato e o comentário que a skill publicou.

## LUI-188-CA3

**Marca:** revisão humana

**Cenário:** Dado duas frentes que acrescentam, cada uma, uma rota e uma migração, quando a segunda sincroniza depois do merge da primeira, então a sincronização regenera o snapshot da OpenAPI a partir do código mergeado, recria a migração da branch com um nome posterior à mais recente da `main`, e o `full` passa. A evidência no PR traz o ensaio, com o que as duas frentes mudaram e o que a sincronização fez.

## LUI-188-CA4

**Marca:** documento

**Cenário:** Dado o diff do PR, quando se lê a seção "Frentes paralelas" do `AGENTS.md` da raiz, então ela diz quando usar a `/sincronizar`: quando o PR da frente fica desatualizado em relação à `main` (o ruleset não deixa mergear), e no fim do ticket, antes do `full`, e aponta a skill sem repetir os passos.
