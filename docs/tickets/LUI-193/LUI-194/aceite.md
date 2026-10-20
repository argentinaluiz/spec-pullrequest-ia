# Aceite do LUI-194

Ticket de harness, o primeiro a pôr mecanismo dentro de uma skill. O CA1 ao CA4 são provados por testes de unidade em shell, que rodam na máquina, ao lado dos scripts da skill, e entram no relatório dos testes em shell com a tag `@LUI-194-CA<n>` no nome do caso: o mapa de testes só nasce no LUI-196, e até lá a tag é a ligação. O CA5 é provado por um teste de integração do projeto, que roda a busca dos testes das skills contra uma árvore temporária. O CA6 é lido no `AGENTS.md`.

O seam do CA1 e do CA2 é a linha de comando da Guarda: o teste a chama com o arquivo da lista, os caminhos alterados na entrada padrão e, para o tipo `comandos`, o `HEAD_DIR` do workflow, e confere a saída e o código de saída. O do CA3 é a mesma linha de comando com a lista real deste projeto. O do CA4 é a entrada JSON do hook do estado, como os testes dos hooks de hoje.

Decisões que os cenários supõem: na lista, o `*` casa dentro de um nível de pasta e o `**` atravessa as barras, para o aceite congelado continuar valendo só na profundidade da issue pai e do ticket; vale o primeiro padrão que casa; o tipo e o caminho se separam por uma tabulação.

## LUI-194-CA1

**Marca:** teste de unidade

**Cenário:** Dado uma lista com um padrão de cada tipo, quando a Guarda recebe os caminhos alterados, então um caminho do tipo bloqueado a reprova com o código 1 e o nome do arquivo; um do tipo aviso passa e sai como aviso; um aceite congelado que já existe no diretório atual avisa, e um novo, ou um fora da profundidade do padrão, não avisa; e um manifesto do tipo comandos cuja seção de comandos mudou a reprova, enquanto o que só mudou dependências avisa.

**Teste previsto:** testes dos scripts da skill `proteger-harness`, `harness-guard.test.sh`, "a Guarda reprova o bloqueado, avisa o aviso e o congelado, e bloqueia o manifesto de comandos".

## LUI-194-CA2

**Marca:** teste de unidade

**Cenário:** Dado um diretório vazio, sem nenhum arquivo deste projeto, só com uma cópia do script da Guarda e uma lista escrita pelo teste, quando se roda a Guarda, então ela classifica os caminhos pela lista. Sem lista, com lista ilegível, com um tipo desconhecido, com a lista de caminhos vazia ou com mais arquivos que o limite da API, ela sai com o código 2 e diz por quê.

**Teste previsto:** testes dos scripts da skill `proteger-harness`, `harness-guard.test.sh`, "a Guarda roda num diretório de fora, só com a lista que recebe".

## LUI-194-CA3

**Marca:** teste de unidade

**Cenário:** Dado a lista de arquivos protegidos deste projeto, quando a Guarda recebe um script ou um hook de qualquer skill, um agente instalado, o workflow, o `settings.json` ou a própria lista, então reprova; recebendo o texto de uma skill (o `SKILL.md`, o modelo do revisor), um formato ou um documento, aprova sem aviso de bloqueio. O mapa de testes de um ticket e os pontos de convergência saem como aviso.

**Teste previsto:** testes dos scripts da skill `verificar`, `arquivos-protegidos.test.sh`, "a lista do projeto bloqueia o mecanismo de qualquer skill e a própria lista, e deixa o texto das skills livre".

## LUI-194-CA4

**Marca:** teste de unidade

**Cenário:** Dado o hook do estado, quando ele recebe o JSON de um comando de shell que lê, grava ou apaga na pasta de estado, inclusive entre aspas, por expansão, em heredoc ou dentro de um interpretador, então sai com o código 2 e a mensagem que diz que o estado é da verificação, com a ajuda que a linha de comando do `settings.json` deu. Um comando que só cita a pasta como texto, ou um nome parecido, sai com 0. Uma entrada que não se lê como JSON, e cita a pasta, também é negada.

**Teste previsto:** testes do hook da skill `proteger-harness`, `state-guard.test.sh`, "nega a pasta de estado em aspas, expansão, heredoc e interpretador, e libera o resto".

## LUI-194-CA5

**Marca:** teste de integração

**Cenário:** Dado uma árvore temporária com duas skills, cada uma com um teste ao lado do script dela, um que passa e um que falha, quando a verificação do projeto busca e roda os testes das skills, então a busca acha os dois sem lista à mão, e o executor dos testes em shell reprova pelo que falha e aprova sem ele. A busca acha também os testes em Node das skills, e o `full` do projeto a usa nos dois grupos.

**Teste previsto:** testes dos scripts do harness, `skill-tests.test.sh`, "a verificação acha os testes de todas as skills sem lista à mão, e um que falha a reprova".

## LUI-194-CA6

**Marca:** documento

**Cenário:** Dado o `AGENTS.md` da raiz, quando se lê a seção das skills do ticket, então ela diz as duas partes do kit (as skills genéricas e as do projeto), a direção da dependência (o projeto pode carregar e chamar arquivo de uma genérica, e uma genérica não carrega arquivo do projeto nem de outra genérica) e a regra de proteção (o texto de skill é livre, e o script e o hook de skill são protegidos). A seção "Arquivos do harness" aponta para a lista de arquivos protegidos.
