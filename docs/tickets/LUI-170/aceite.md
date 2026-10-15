# Aceite do LUI-170

Os critérios do motor (CA1 a CA7) são provados por testes de unidade da web, com o Vitest, no `lib/uploads/` ao lado do motor: ele recebe o transporte (um `fetch` falso, que responde como o storage), o relógio e as ações da API (início, conclusão e cancelamento) injetados, e não conhece React. O CA8 é provado na suíte de ponta a ponta da API, com o PostgreSQL de testes e o emulador reais. Os de tela (CA9 a CA13) rodam no Playwright, contra a web, a API e o emulador reais. O desenho está no `docs/lld.md`, seções 4.6 e 7.4, e no `apps/api/openapi.json` (`DELETE /v1/uploads/{itemId}`).

**O que o emulador muda na prova do navegador (LLD, seção 4.6).** O emulador não expõe o `Range` da resposta 308 ao navegador (o CORS dele é fixo) e trata a consulta de progresso (`PUT` vazio com `Content-Range: bytes */<total>`) como o fim do envio. Sem isso, nenhum arquivo maior que um chunk sai do navegador contra o emulador. Os testes no navegador usam um auxiliar de `e2e/support/` que intercepta, pelo `page.route`, só os pedidos à sessão de upload: repassa os chunks ao emulador e acrescenta à resposta o `Access-Control-Expose-Headers: Range`, que é o que a configuração de CORS do bucket faz no Cloud Storage; e responde ele mesmo à consulta de progresso, com 308 e o `Range` dos bytes que o emulador já confirmou. O mesmo auxiliar falha um chunk de propósito (CA10) e segura um chunk enquanto a pessoa pausa (CA11). O resto (a sessão, os chunks, a conclusão, a Cota, o objeto) é o emulador e a API reais. O comportamento do Cloud Storage nesses dois pontos fica para o staging, como o HLD já registra.

**Como o teste solta uma pasta (CA12).** O Playwright não arrasta arquivos do sistema operacional, então o teste monta o `DataTransfer` na página. Um `DataTransfer` montado não traz pastas, e o navegador reconhece a pasta pelo `webkitGetAsEntry()` do item. O teste marca, por um script de inicialização, um item chamado `Fotos` como pasta nesse método; o resto da soltura é o da página.

## LUI-170-CA1

**Marca:** teste de unidade

**Cenário:** Dado o motor com um transporte falso que responde 308 com o `Range` do que recebeu e 200 no último chunk, quando ele envia um arquivo de 20 MiB, então faz três `PUT` em sequência, com `Content-Range: bytes 0-8388607/20971520`, `bytes 8388608-16777215/20971520` e `bytes 16777216-20971519/20971520`: os dois primeiros com 8 MiB, múltiplos de 256 KiB, e o último com o resto. Quando envia um arquivo de 5 MiB, então faz um único `PUT` com o arquivo inteiro e `Content-Range: bytes 0-5242879/5242880`. E um arquivo vazio vai num único `PUT` sem corpo, como hoje.

**Teste previsto:** unidade da web, `apps/web/lib/uploads/engine.spec.ts`, "corta o arquivo em chunks de 8 MiB e envia o menor que um chunk num envio só @LUI-170-CA1".

## LUI-170-CA2

**Marca:** teste de unidade

**Cenário:** Dado um arquivo de 20 MiB e um transporte falso que, no primeiro `PUT`, responde 308 com `Range: bytes=0-4194303` (só 4 MiB recebidos), quando o motor continua, então o segundo `PUT` começa no byte 4194304 (`Content-Range: bytes 4194304-12582911/20971520`), e não em 8388608. E o progresso que o motor informa à tela segue o que o storage confirmou.

**Teste previsto:** unidade da web, `apps/web/lib/uploads/engine.spec.ts`, "calcula o próximo chunk pelo que o storage confirmou, e não pelo que enviou @LUI-170-CA2".

## LUI-170-CA3

**Marca:** teste de unidade

**Cenário:** Dado um arquivo de dois chunks e um transporte falso em que o segundo `PUT` falha por rede numa vez e responde 503 em outra, quando o motor envia, então, depois de cada falha, ele espera (pelo relógio injetado) 1 segundo e depois 2, faz a consulta de progresso (`PUT` vazio com `Content-Range: bytes */<total>`), recomeça do byte confirmado e o arquivo termina. Dado um transporte em que o chunk falha sempre, quando o motor envia, então ele repete 5 vezes, com esperas de 1, 2, 4, 8 e 16 segundos (nunca acima de 30), e o arquivo termina como falha, sem chamar a conclusão.

**Teste previsto:** unidade da web, `apps/web/lib/uploads/engine.spec.ts`, "repete o chunk que falhou depois de consultar o progresso, até 5 vezes com espera crescente, e falha o arquivo @LUI-170-CA3".

## LUI-170-CA4

**Marca:** teste de unidade

**Cenário:** Dado um envio em andamento e um transporte falso que responde 404 ao chunk (e, noutro caso, 410), quando o motor recebe a resposta, então chama o cancelamento na API com o `itemId` do envio, pede um novo início à API e envia o arquivo do byte 0 na sessão nova, e o arquivo termina concluído pela sessão nova.

**Teste previsto:** unidade da web, `apps/web/lib/uploads/engine.spec.ts`, "com a sessão expirada, cancela o upload e recomeça do zero numa sessão nova @LUI-170-CA4".

## LUI-170-CA5

**Marca:** teste de unidade

**Cenário:** Dado um arquivo cujo último chunk o storage confirmou e uma API falsa cuja conclusão responde `upload_incomplete` na primeira chamada, quando o motor recebe essa resposta, então faz a consulta de progresso, envia o que faltar a partir do byte confirmado (ou nada, se o storage já tem tudo), chama a conclusão de novo, e o arquivo termina concluído, sem passar pelo estado de falha.

**Teste previsto:** unidade da web, `apps/web/lib/uploads/engine.spec.ts`, "um upload_incomplete na conclusão faz o motor consultar o progresso e retomar @LUI-170-CA5".

## LUI-170-CA6

**Marca:** teste de unidade

**Cenário:** Dado o motor com cinco arquivos na fila e um transporte falso que segura cada `PUT` até o teste liberá-lo, quando os envios começam, então só os três primeiros chegam ao transporte; quando o teste libera o primeiro até o fim, então o quarto começa, e nunca há mais de três envios ao mesmo tempo. O resumo que o motor informa conta os cinco ("3 de 5" enquanto três enviam).

**Teste previsto:** unidade da web, `apps/web/lib/uploads/engine.spec.ts`, "envia no máximo 3 arquivos ao mesmo tempo e começa o próximo da fila quando um termina @LUI-170-CA6".

## LUI-170-CA7

**Marca:** teste de unidade

**Cenário:** Dado um arquivo de três chunks com o segundo `PUT` em curso, quando a pessoa pausa, então o motor aborta esse `PUT` (o sinal de cancelamento do transporte dispara), o arquivo fica pausado e nenhum `PUT` novo sai enquanto ele está pausado. Quando a pessoa retoma, então o motor faz a consulta de progresso, continua do byte que o storage confirmou e o arquivo termina.

**Teste previsto:** unidade da web, `apps/web/lib/uploads/engine.spec.ts`, "pausar aborta o chunk em curso, e retomar continua do byte que o storage confirmou @LUI-170-CA7".

## LUI-170-CA8

**Marca:** teste HTTP

**Cenário:** Dado um Usuário A com um upload pendente com bytes enviados ao emulador e a Cota reservada, quando A pede `DELETE /uploads/{itemId}`, então a resposta é 204 sem corpo, o `used_bytes` volta ao valor de antes do envio, o objeto não existe mais no emulador e `POST /uploads/{itemId}/complete` responde `not_found`. Quando A pede `DELETE` do mesmo id de novo, de um arquivo `active` dele, de um upload pendente do Usuário B e de um id que não existe ou não é UUID, então cada resposta é 404 `not_found`, e a Cota de B não muda. Sem token, a resposta é 401 `unauthenticated`.

**Teste previsto:** ponta a ponta da API, `apps/api/test/uploads-cancel.e2e-spec.ts`, "cancela o upload pendente e devolve o espaço, e responde not_found ao que não está pendente ou é de outro Usuário @LUI-170-CA8".

## LUI-170-CA9

**Marca:** teste no Playwright

**Cenário:** Dado um Usuário em "Meus arquivos", quando ele arrasta sobre a lista um arquivo de 9 MiB e dois pequenos, então a zona de soltar aparece com o nome "Meus arquivos"; quando solta, então o painel de envios mostra os três, o resumo do envio ("Enviando 3 de 3" enquanto enviam) e o progresso do arquivo grande passando por um valor intermediário antes de 100. No fim, os três aparecem como concluídos e na lista, sem recarregar a página, e o arquivo grande tem o tamanho certo.

**Teste previsto:** Playwright, `apps/web/e2e/upload-many.spec.ts`, "o Usuário arrasta vários arquivos para a lista, inclusive um maior que um chunk, e acompanha o envio no painel @LUI-170-CA9".

## LUI-170-CA10

**Marca:** teste no Playwright

**Cenário:** Dado um Usuário enviando um arquivo de 9 MiB e o auxiliar do storage configurado para falhar uma vez o segundo chunk (pela rede), quando o envio segue, então o painel nunca mostra o arquivo como falha, o arquivo termina concluído, e o download dele traz exatamente os 9 MiB enviados (o mesmo hash).

**Teste previsto:** Playwright, `apps/web/e2e/upload-many.spec.ts`, "um chunk que falha no meio é repetido sozinho, e o arquivo chega inteiro @LUI-170-CA10".

## LUI-170-CA11

**Marca:** teste no Playwright

**Cenário:** Dado um Usuário enviando dois arquivos de 17 MiB, com o auxiliar do storage segurando o segundo chunk do primeiro, quando ele pausa o primeiro no painel, então o item mostra o estado pausado e o botão de retomar; quando retoma, então o envio continua e o arquivo termina concluído e aparece na lista. Quando ele cancela o segundo, então o item sai do painel, o arquivo não aparece na lista, nem depois de recarregar a página, e a Cota volta a não contar os bytes dele.

**Teste previsto:** Playwright, `apps/web/e2e/upload-many.spec.ts`, "o Usuário pausa e retoma um envio, e cancela outro, que some sem aparecer na lista @LUI-170-CA11".

## LUI-170-CA12

**Marca:** teste no Playwright

**Cenário:** Dado um Usuário em "Meus arquivos", quando ele solta sobre a lista uma pasta `Fotos` junto com dois arquivos, então o painel mostra o aviso "Pastas não podem ser enviadas. Envie os arquivos de dentro da pasta." e só os dois arquivos, que terminam concluídos e aparecem na lista; nenhum item `Fotos` aparece no painel nem na lista. Quando ele fecha o painel, então o aviso some.

**Teste previsto:** Playwright, `apps/web/e2e/upload-many.spec.ts`, "soltar uma pasta junto com arquivos envia só os arquivos e mostra o aviso de pasta solta @LUI-170-CA12".

## LUI-170-CA13

**Marca:** teste no Playwright

**Cenário:** Dado um Usuário em "Meus arquivos", quando ele escolhe três arquivos de uma vez no seletor do botão "Enviar", então os três entram no painel, terminam concluídos e aparecem na lista. E o seletor aceita vários arquivos e não é de pasta (sem `webkitdirectory`).

**Teste previsto:** Playwright, `apps/web/e2e/upload-many.spec.ts`, "o botão Enviar aceita vários arquivos de uma vez @LUI-170-CA13".
