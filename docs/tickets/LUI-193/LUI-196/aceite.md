# Aceite do LUI-196

Ticket de harness e de texto de skill. O CA1 ao CA4 são provados por testes de unidade do conferidor do aceite, que muda para a skill `/plan-ticket` e ganha o mapa de testes; o CA5, por um teste de unidade do script da página do plano; o CA6, por um teste de unidade do hook de congelamento, que também muda para a skill; o CA7, por um teste de integração do projeto; o CA8 e o CA9, pela leitura dos textos; o CA10, por uma sessão real.

Como cada teste se liga ao critério: um teste de skill genérica não leva ID de critério deste projeto, então o CA1 ao CA4 e o CA6 são ligados pelo mapa de testes do próprio ticket (`docs/tickets/LUI-193/LUI-196/mapa-de-testes.txt`), com uma linha por ligação, gravada na implementação pelo procedimento que este ticket descreve. Os testes do projeto continuam com o ID na tag do nome do caso, como o CA5 e o CA7.

Decisões que os cenários supõem: o mapa é um arquivo de texto com uma linha por ligação, com o ID, o caminho do arquivo de teste e o nome do caso, separados por uma tabulação, e o caminho e o nome são os que o relatório da suíte traz; o conferidor casa o arquivo pelo fim do caminho do relatório e o caso pelo nome inteiro; a pasta dos tickets chega ao hook de congelamento como argumento da linha de comando do `settings.json`, e o padrão dele é `docs/tickets`.

## LUI-196-CA1

**Marca:** teste de unidade

**Cenário:** Dado um ticket com um critério de teste, um mapa com uma linha que liga o critério a um caso e um relatório em que esse caso passou, sem tag nenhuma, quando o conferidor roda, então ele cobre o critério pela linha do mapa, e reprova com a mensagem de teste que falhou quando o caso do relatório falhou.

**Teste previsto:** testes do conferidor da skill `plan-ticket`, `check-acceptance.test.cjs`, "uma linha do mapa vale como a tag do caso ligado, e o critério fica coberto quando o caso roda e passa".

## LUI-196-CA2

**Marca:** teste de unidade

**Cenário:** Dado um mapa com uma linha cujo caso não aparece no relatório, quando o conferidor roda, então ele reprova e a mensagem traz o ID, o arquivo e o nome do caso da linha, e o mesmo vale para o caso do mapa que está no relatório de outro arquivo.

**Teste previsto:** testes do conferidor da skill `plan-ticket`, `check-acceptance.test.cjs`, "um caso do mapa que não aparece no relatório reprova, dizendo o ID, o arquivo e o nome do caso".

## LUI-196-CA3

**Marca:** teste de unidade

**Cenário:** Dado um mapa com uma linha cujo ID não está em nenhum arquivo de aceite, quando o conferidor roda, então ele reprova dizendo o ID e o mapa; e uma linha mal formada (sem as três partes) também reprova, dizendo o número da linha.

**Teste previsto:** testes do conferidor da skill `plan-ticket`, `check-acceptance.test.cjs`, "um ID do mapa que não está em nenhum arquivo de aceite reprova".

## LUI-196-CA4

**Marca:** teste de unidade

**Cenário:** Dado um critério de teste coberto por um caso com o ID na tag, quando o ticket tem um mapa de testes que não cita o critério, e quando o ticket não tem mapa nenhum, então o conferidor cobre o critério nos dois casos, e um mapa em outro ticket não muda o resultado.

**Teste previsto:** testes do conferidor da skill `plan-ticket`, `check-acceptance.test.cjs`, "o teste com o ID na tag continua cobrindo o critério, com ou sem mapa no ticket".

## LUI-196-CA5

**Marca:** teste de unidade

**Cenário:** Dado um `.gitignore` que versiona só o aceite de cada ticket, quando se roda o script da página do plano, então ele para dizendo a linha que falta para o mapa de testes entrar no Git; e dado um `.gitignore` que versiona o aceite e o mapa e ignora o resto, então ele monta a página.

**Teste previsto:** testes do script da página do plano, `scripts/test/plan-page.test.sh`, "o script exige que o mapa de testes do ticket não seja ignorado @LUI-196-CA5".

## LUI-196-CA6

**Marca:** teste de unidade

**Cenário:** Dado o hook de congelamento, chamado com a pasta dos tickets como argumento, quando recebe a edição de um aceite que já está em commit, então nega com o código 2; a edição do mapa de testes do mesmo ticket, a de um aceite novo e a de outro arquivo da pasta do ticket saem com 0; e dado outra pasta dos tickets no argumento, ele congela o aceite dessa pasta e libera o da pasta de antes.

**Teste previsto:** testes do hook da skill `plan-ticket`, `freeze-acceptance.test.sh`, "nega editar o aceite em commit, libera o mapa de testes e respeita a pasta dos tickets do argumento".

## LUI-196-CA7

**Marca:** teste de integração

**Cenário:** Dado os mapas gravados nas pastas dos tickets que os testes do conferidor provavam (LUI-164 e LUI-175), quando se lê cada linha de cada mapa do repositório, então o ID está num arquivo de aceite, o arquivo de teste existe e traz o nome do caso; nenhum teste de skill traz um ID deste projeto; e o conferidor, com um relatório montado das linhas dos mapas, cobre cada um desses critérios sem tag no relatório.

**Teste previsto:** testes dos scripts da skill `verificar`, `mapas-de-testes.test.sh`, "os critérios provados pelos testes do conferidor continuam cobertos pelo mapa, sem ID deste projeto nos testes da skill @LUI-196-CA7".

## LUI-196-CA8

**Marca:** documento

**Cenário:** Dado o texto da skill `/plan-ticket` e o da `tdd`, quando se lê o `SKILL.md` da `/plan-ticket` e o formato do mapa (`formatos/mapa-de-testes.md`), então eles descrevem o mapa e o procedimento: o conferidor acusa um critério sem teste ou um caso do mapa que não rodou, o agente procura o caso pelo "Teste previsto", grava a linha quando acha um só e mostra os candidatos e pergunta quando acha nenhum ou mais de um; e o `SKILL.md` da `tdd` diz que grava a linha ao escrever um teste de skill que prova um critério.

## LUI-196-CA9

**Marca:** documento

**Cenário:** Dado o `AGENTS.md` da raiz, quando se lê a seção "Plano do ticket", então a lista se chama "Valores das skills do ticket" e traz os valores da `/plan-ticket` e da `/proteger-harness`; e dado o passo 0 da `/plan-ticket`, ele lê dessa lista, tem o padrão de cada valor, manda anunciar os valores que vieram do padrão, pula o passo que usa um valor `nenhum` e só pergunta um valor que não tem padrão.

## LUI-196-CA10

**Marca:** revisão humana

**Cenário:** Dado a sessão em que o ticket é implementado, quando o conferidor acusa um critério sem teste de um teste de skill, então a sessão usa o procedimento do CA8 de verdade, com um caso achado pelo "Teste previsto" e gravado no mapa, e um caso que pergunta à pessoa os candidatos, e a pessoa vê as duas coisas no chat.
