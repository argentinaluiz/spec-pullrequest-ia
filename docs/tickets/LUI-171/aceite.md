# Aceite do LUI-171

Retomar um envio depois de fechar ou recarregar a aba. A rota de retomada (CA1 e CA2) é provada pelos testes de ponta a ponta da API, pela porta HTTP, com o emulador de storage real. A impressão do arquivo (CA3), o armazenamento por Usuário (CA4) e a saída silenciosa de um incompleto que já não existe (CA5) são regras do navegador sem tela, provadas por unidade: a impressão e o armazenamento são funções de `lib/uploads`, e o CA5 é o motor de envio, com as ações da API e o armazenamento injetados. O que só existe na tela (CA6 a CA10) é provado no Playwright, contra a web e a API reais.

**Por que o arquivo vai para o disco do contêiner nos testes no navegador:** a impressão inclui a data de modificação. Um arquivo montado em memória pelo `setInputFiles` ganha uma data nova a cada seleção, e a segunda seleção nunca seria "o mesmo arquivo". O teste grava o arquivo numa pasta temporária do contêiner `playwright` e o seleciona pelo caminho, duas vezes, com a mesma data.

**Por que a retomada é consultada ao voltar ao Drive, e não só ao escolher o arquivo:** o painel mostra, no estado de espera, a porcentagem que o storage já tem, e um incompleto que já foi concluído, cancelado ou limpo sai sozinho, sem esperar a pessoa escolher um arquivo. A URL da sessão fica só na memória da aba.

**Por que só o envio que manda bytes pede confirmação ao fechar:** um envio pausado ou esperando o arquivo não perde nada ao fechar a aba, porque volta como incompleto. A confirmação vale para o que está enviando ou na fila.

**Exceção à decisão de teste da spec:** a Cota não tem tela até a funcionalidade 08. O CA8 lê a Cota usada no banco, por `usedBytesOf()` (`e2e/support/quota.ts`), como o LUI-170 já faz.

## LUI-171-CA1

**Marca:** teste HTTP

**Cenário:** Dado um upload criado por `POST /uploads` e ainda pendente, quando o dono pede `GET /uploads/{itemId}`, então a resposta é 200 com o mesmo `itemId`, a mesma `uploadUrl` e o mesmo `expiresAt` que a criação devolveu.

**Teste previsto:** ponta a ponta da API, `apps/api/test/uploads-resume.e2e-spec.ts`, "devolve a sessão de um upload pendente @LUI-171-CA1".

## LUI-171-CA2

**Marca:** teste HTTP

**Cenário:** Dado, um por teste, um upload já concluído, um upload cancelado, o upload pendente de outro Usuário, um UUID que não existe e um id que não é UUID, quando o Usuário pede `GET /uploads/{itemId}`, então a resposta é 404 com `code` `not_found`, e o corpo não traz `uploadUrl`.

**Teste previsto:** ponta a ponta da API, `apps/api/test/uploads-resume.e2e-spec.ts`, um teste por caso, cada um com "@LUI-171-CA2" no título, como "não devolve a sessão de um upload concluído @LUI-171-CA2".

## LUI-171-CA3

**Marca:** teste de unidade

**Cenário:** Dada a impressão de um arquivo (nome, tamanho e data de modificação), quando ela é comparada com o mesmo arquivo, então ela o aceita; e, quando é comparada com um arquivo que só muda no nome, depois com um que só muda no tamanho e depois com um que só muda na data, então ela recusa cada um.

**Teste previsto:** unidade da web, `apps/web/lib/uploads/fingerprint.spec.ts`, "aceita o mesmo arquivo e recusa outro nome, tamanho ou data @LUI-171-CA3".

## LUI-171-CA4

**Marca:** teste de unidade

**Cenário:** Dado um armazenamento do navegador em que o Usuário A guardou um incompleto, quando o Usuário B lê os incompletos no mesmo armazenamento, então a lista dele vem vazia, e a do Usuário A continua com o incompleto.

**Teste previsto:** unidade da web, `apps/web/lib/uploads/incomplete-store.spec.ts`, "os incompletos de um Usuário não aparecem para outro no mesmo navegador @LUI-171-CA4".

## LUI-171-CA5

**Marca:** teste de unidade

**Cenário:** Dado o motor de envio com um incompleto guardado e a ação de retomada respondendo `not_found`, quando o motor carrega os incompletos, então o painel fica sem esse envio, sem nenhuma entrada de falha nem mensagem, e o incompleto sai do armazenamento.

**Teste previsto:** unidade da web, `apps/web/lib/uploads/engine.spec.ts`, "um incompleto que a retomada não acha sai do painel e do armazenamento, sem aviso @LUI-171-CA5".

## LUI-171-CA6

**Marca:** teste no Playwright

**Cenário:** Dado um Usuário que envia um arquivo de três chunks gravado no disco, com o segundo chunk segurado depois de o storage confirmar o primeiro, quando ele recarrega a aba, vê o envio no painel com o pedido de selecionar o arquivo de novo e seleciona o mesmo arquivo pelo botão do item, então o primeiro `Content-Range` com bytes enviado depois da seleção começa no byte 8 MiB, e não no 0, e o arquivo aparece na lista com o tamanho dele.

**Teste previsto:** Playwright, `apps/web/e2e/upload-resume.spec.ts`, "retoma depois de recarregar a aba sem reenviar o que o storage já tinha @LUI-171-CA6".

## LUI-171-CA7

**Marca:** teste no Playwright

**Cenário:** Dado o envio incompleto que voltou depois de recarregar a aba, quando o Usuário seleciona um arquivo com outro nome pelo botão do item, então o item mostra "Não é o mesmo arquivo. Selecione <nome do original>.", nenhum pedido sai para a sessão de upload depois da seleção, e o item continua com o botão de selecionar o arquivo.

**Teste previsto:** Playwright, `apps/web/e2e/upload-resume.spec.ts`, "recusa um arquivo diferente sem enviar nada @LUI-171-CA7".

## LUI-171-CA8

**Marca:** teste no Playwright

**Cenário:** Dado o envio incompleto que voltou depois de recarregar a aba, com o tamanho dele reservado na Cota, quando o Usuário o cancela no painel, então o item sai do painel, a Cota usada volta a zero e, ao recarregar de novo, o painel não o mostra mais.

**Teste previsto:** Playwright, `apps/web/e2e/upload-resume.spec.ts`, "cancelar um incompleto o tira do painel e devolve o espaço @LUI-171-CA8".

## LUI-171-CA9

**Marca:** teste no Playwright

**Cenário:** Dado um envio em andamento, com a URL da sessão que o storage usou vista pelo auxiliar dos testes, quando se lê todo o `localStorage` da página, então o `itemId` do envio está lá, e nenhum valor contém a URL da sessão nem o identificador do upload que ela traz.

**Teste previsto:** Playwright, `apps/web/e2e/upload-resume.spec.ts`, "o armazenamento local não guarda a URL da sessão @LUI-171-CA9".

## LUI-171-CA10

**Marca:** teste no Playwright

**Cenário:** Dado um envio que está mandando bytes, quando a aba é recarregada, então o navegador abre o diálogo `beforeunload`. E, num teste à parte, dado um painel só com um envio concluído, quando a aba é recarregada, então nenhum diálogo abre e a página recarrega.

**Teste previsto:** Playwright, `apps/web/e2e/upload-many.spec.ts`, "com um envio em andamento, fechar a aba pede confirmação @LUI-171-CA10" (o teste que o LUI-170 já trouxe, que ganha o ID) e "sem envio em andamento, fechar a aba não pede confirmação @LUI-171-CA10".
