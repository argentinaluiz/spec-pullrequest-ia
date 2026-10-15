# Aceite do LUI-167

Os critérios de contrato (CA1 a CA10) são provados pelas rotas da API, na suíte de ponta a ponta, com o PostgreSQL de testes e o emulador de storage reais. No papel do navegador, o teste envia os bytes por `PUT` à URL da sessão, depois de trocar a origem dela pela de `STORAGE_EMULATOR_HOST`: a API devolve o endereço público (`STORAGE_PUBLIC_URL`, `localhost:4443`), que o contêiner da API não alcança (mesmo ajuste do `LUI-165-CA2`, no auxiliar `test/support/uploads.ts`). Os de tela (CA12 e CA13) rodam no Playwright, contra a web, a API e o emulador reais. O desenho está no `apps/api/openapi.json` (rotas), no `apps/api/prisma/schema.prisma` (`quotas` e `plans`) e no `docs/lld.md`, seções 4.2 e 4.6 (regras).

**O que o emulador muda na prova (LLD, seção 4.6).** Nada do que o emulador não reproduz entra no caminho deste ticket: o envio é um único `PUT`, sem chunk, sem consulta de progresso e sem cancelamento de sessão, e o CORS fixo do emulador deixa o `PUT` do navegador passar. O que ficaria sem prova aqui, e fica para o staging, é o `PUT` do navegador com um `Content-Type` que exige pré-voo de CORS: os testes enviam arquivos `text/plain`, que o CORS trata como simples. Todo critério abaixo é provável como está escrito no Linear.

**Preparação por banco.** Para dar à Cota o espaço livre que o cenário pede, os testes gravam direto a linha em `quotas` (`used_bytes`), como já fazem com `items` (`LUI-166`). Os testes de API usam o banco de testes. O de navegador (CA13) grava no banco da API que a web usa, pela `DATABASE_URL` do serviço `playwright`. A suíte de API não apaga a tabela `plans`: ela é dado de referência da migração, e a limpeza do banco de testes a preserva.

**Lacuna dos critérios, sem teste com ID próprio.** O Linear não traz critério para o tipo MIME vazio virar `application/octet-stream` (coberto dentro do cenário do CA9) nem para o `401` sem token (coberto dentro do CA5). Quem aprova decide se acrescenta um critério; este arquivo não os cria.

## LUI-167-CA1

**Marca:** teste HTTP

**Cenário:** Dado um Usuário com Sessão, quando ele faz `POST /v1/uploads` com `name` "relatorio.txt", `sizeBytes` 5, `mimeType` "text/plain" e `parentId` "root", então a resposta é 201 com `itemId` (um UUID), `uploadUrl` com a origem de `STORAGE_PUBLIC_URL` e `expiresAt` numa data futura. E, antes de os bytes chegarem, a lista `GET /v1/items/root/children` não traz o arquivo (o Item é pendente e invisível). Quando o teste envia os 5 bytes por `PUT` à `uploadUrl` (resposta 200) e faz `POST /v1/uploads/{itemId}/complete`, então a resposta é 200 com o Item ativo (id igual ao `itemId`, tipo `file`, nome, `sizeBytes` 5 e `mimeType` "text/plain"), e a lista da raiz passa a trazê-lo.

**Teste previsto:** ponta a ponta da API, `apps/api/test/uploads-create.e2e-spec.ts`, "cria o upload, recebe os bytes no storage e conclui, e o arquivo aparece na lista da raiz @LUI-167-CA1".

## LUI-167-CA2

**Marca:** teste HTTP

**Cenário:** Dado um Usuário cuja Cota tem 9 bytes livres no plano gratuito (linha gravada com `used_bytes` igual ao limite menos 9), quando ele faz `POST /v1/uploads` com `sizeBytes` 10, então a resposta é 413 com `quota_exceeded`. E nenhum Item foi criado (o banco não tem Item pendente dele) e o espaço livre continua 9: um `POST /v1/uploads` com `sizeBytes` 9 responde 201.

**Teste previsto:** ponta a ponta da API, `apps/api/test/uploads-create.e2e-spec.ts`, "recusa com quota_exceeded um upload que não cabe, sem criar Item nem gastar espaço @LUI-167-CA2".

## LUI-167-CA3

**Marca:** teste HTTP

**Cenário:** Dado um Usuário cuja Cota tem 2,5 GiB livres, quando ele faz cinco `POST /v1/uploads` simultâneos de 1 GiB cada (só reservam, sem enviar bytes), então exatamente dois respondem 201 e três respondem 413 com `quota_exceeded`. E, em seguida, um `POST /v1/uploads` de 0,5 GiB responde 201 e outro de 1 byte responde 413: o espaço reservado soma 2 GiB, e nada além do que coube.

**Teste previsto:** ponta a ponta da API, `apps/api/test/uploads-create.e2e-spec.ts`, "aceita só os uploads simultâneos que cabem na Cota @LUI-167-CA3".

## LUI-167-CA4

**Marca:** teste HTTP

**Cenário:** Dado um Usuário com a Cota cheia (nenhum byte livre), quando ele faz `POST /v1/uploads` com `sizeBytes` igual a 5 GiB mais 1 byte, então a resposta é 413 com `file_too_large`, e não `quota_exceeded`: o tamanho é conferido antes da reserva. Dado outro Usuário com a Cota vazia, quando ele cria um upload de exatamente 5 GiB, então a resposta é 201 (o limite é inclusivo); e, depois de um upload de 5 GiB + 1 recusado, um de 1 GiB ainda cabe: a recusa não reservou espaço.

**Teste previsto:** ponta a ponta da API, `apps/api/test/uploads-create.e2e-spec.ts`, "recusa com file_too_large o arquivo acima de 5 GB, antes de reservar espaço @LUI-167-CA4".

## LUI-167-CA5

**Marca:** teste HTTP

**Cenário:** Dado um Usuário com Sessão, quando ele faz `POST /v1/uploads` com cada uma destas entradas, então a resposta é 400 com `validation_error` para o nome vazio, o nome com `/`, o nome com um caractere de controle (como `\n`), o nome com 256 caracteres, o `sizeBytes` negativo, o `sizeBytes` fracionário e o `sizeBytes` em texto; e é 404 com `not_found` para um `parentId` que é um UUID inexistente, o de um arquivo do próprio Usuário, o de uma pasta ativa de outro Usuário, o de uma pasta do próprio Usuário na lixeira e um texto que não é UUID nem `root`. E um pedido sem o cabeçalho `Authorization` responde 401 com `unauthenticated`. Depois de todas essas recusas, o Usuário não tem Item pendente nem espaço reservado. E um nome de 255 caracteres e o nome "a.b c.txt" são aceitos (201), a prova de que a validação não recusa o que é válido.

**Teste previsto:** ponta a ponta da API, `apps/api/test/uploads-create.e2e-spec.ts`, "recusa nome, tamanho e destino inválidos, sem criar Item @LUI-167-CA5".

## LUI-167-CA6

**Marca:** teste HTTP

**Cenário:** Dado um Usuário com a Cota de 10 bytes livres, que cria um upload de 10 bytes (a Cota fica cheia) e envia só 4 bytes ao storage, quando ele faz `POST /v1/uploads/{itemId}/complete`, então a resposta é 409 com `upload_size_mismatch`. E o objeto deixou de existir no emulador (a leitura do objeto no emulador, pela chave que o banco guarda, responde 404). E o espaço voltou: um novo `POST /v1/uploads` de 10 bytes responde 201. E o Item não existe mais: nova conclusão do mesmo `itemId` responde 404 com `not_found`.

**Teste previsto:** ponta a ponta da API, `apps/api/test/uploads-complete.e2e-spec.ts`, "recusa a conclusão com tamanho diferente, apaga o objeto e devolve o espaço @LUI-167-CA6".

## LUI-167-CA7

**Marca:** teste HTTP

**Cenário:** Dado um upload criado de 5 bytes, quando o Usuário pede `POST /v1/uploads/{itemId}/complete` sem ter enviado nenhum byte, então a resposta é 409 com `upload_incomplete`, e o arquivo continua fora da lista da raiz. Quando o teste envia os 5 bytes à sessão e repete a conclusão, então a resposta é 200 com o Item ativo, e a lista da raiz o traz.

**Teste previsto:** ponta a ponta da API, `apps/api/test/uploads-complete.e2e-spec.ts`, "responde upload_incomplete antes de o objeto chegar e conclui depois do envio completo @LUI-167-CA7".

## LUI-167-CA8

**Marca:** teste HTTP

**Cenário:** Dado um Usuário com a Cota de 20 bytes livres e um upload de 10 bytes enviado e concluído, quando ele repete `POST /v1/uploads/{itemId}/complete`, então a resposta é 200 com o mesmo Item (o mesmo corpo da primeira), e a lista da raiz traz o arquivo uma só vez. E o espaço não foi reservado de novo: um novo `POST /v1/uploads` de 10 bytes ainda responde 201. Duas conclusões simultâneas do mesmo upload respondem 200 as duas, com o mesmo Item.

**Teste previsto:** ponta a ponta da API, `apps/api/test/uploads-complete.e2e-spec.ts`, "devolve o mesmo Item ativo na conclusão repetida, sem reservar espaço de novo @LUI-167-CA8".

## LUI-167-CA9

**Marca:** teste HTTP

**Cenário:** Dado um Usuário com Sessão, quando ele faz `POST /v1/uploads` com `sizeBytes` 0 e sem `mimeType`, então a resposta é 201. Quando o teste faz um `PUT` sem corpo à sessão (resposta 200) e pede a conclusão, então a resposta é 200 com o Item ativo, de `sizeBytes` 0 e `mimeType` "application/octet-stream" (o tipo vazio vira o padrão), e a lista da raiz o traz.

**Teste previsto:** ponta a ponta da API, `apps/api/test/uploads-complete.e2e-spec.ts`, "envia e conclui um arquivo de 0 bytes, com o tipo padrão @LUI-167-CA9".

## LUI-167-CA10

**Marca:** teste HTTP

**Cenário:** Dado um upload do Usuário A, enviado ao storage mas ainda não concluído, quando o Usuário B faz `POST /v1/uploads/{itemId}/complete` com esse `itemId`, então a resposta é 404 com `not_found`, igual à de um `itemId` que não existe. E o Item do Usuário A continua pendente: a conclusão dele funciona em seguida.

**Teste previsto:** ponta a ponta da API, `apps/api/test/uploads-complete.e2e-spec.ts`, "responde not_found à conclusão do upload de outro Usuário @LUI-167-CA10".

## LUI-167-CA11

**Marca:** revisão humana

**Cenário:** Dado um banco na migração anterior à da Cota, com um Usuário já cadastrado (e, se houver, arquivos dele), quando se aplica a migração (`docker compose -f compose.dev.yaml exec api pnpm exec prisma migrate deploy`), então `SELECT * FROM quotas` traz a linha desse Usuário no plano `free` (15 GB, em `plans`), com `used_bytes` igual à soma do tamanho dos arquivos dele, e a tabela `plans` traz só o plano gratuito. Quando esse Usuário entra pela web e envia um arquivo pelo botão "Enviar", então o envio conclui, e `used_bytes` sobe pelo tamanho do arquivo. O revisor confere a migração e esse resultado no ambiente de desenvolvimento.

## LUI-167-CA12

**Marca:** teste no Playwright

**Cenário:** Dado um Usuário que entrou e está em "Meus arquivos" (lista vazia), quando ele clica em "Enviar" na barra superior e escolhe o arquivo `relatorio.txt` (texto, com conteúdo conhecido) no seletor, então o painel de envios aparece com o item `relatorio.txt` e, ao fim do envio, o item mostra o estado concluído, e a lista passa a ter a linha `relatorio.txt` com o tamanho do arquivo, sem recarregar a página (a navegação não acontece: um marcador gravado na página antes do envio continua lá) e sem o estado vazio.

**Teste previsto:** navegador, `apps/web/e2e/upload.spec.ts`, "o Usuário envia um arquivo pelo botão Enviar, vê o envio no painel e o arquivo na lista sem recarregar @LUI-167-CA12".

## LUI-167-CA13

**Marca:** teste no Playwright

**Cenário:** Dado um Usuário que entrou e cuja Cota está cheia (a linha de `quotas` gravada no banco com `used_bytes` igual ao limite do plano), quando ele envia um arquivo pelo botão "Enviar", então o painel mostra o item com o estado de falha e a mensagem "Não há espaço na sua cota para este arquivo", a lista continua sem o arquivo (mantém o estado vazio), e nenhuma outra mensagem de erro aparece na página.

**Teste previsto:** navegador, `apps/web/e2e/upload.spec.ts`, "um envio sem espaço na Cota aparece no painel como erro daquele arquivo @LUI-167-CA13".
