# Aceite do LUI-168

Os critérios de contrato (CA1 a CA3) são provados pela rota `GET /items/{id}/download-url`, na suíte de ponta a ponta da API, com o PostgreSQL de testes e o emulador de storage reais. Os de tela e de rota da web (CA4 a CA6) rodam no Playwright, contra a web, a API e o emulador reais. O desenho está no `apps/api/openapi.json` (rota e `DownloadUrlDto`) e no `docs/lld.md`, seções 3.4, 4.6, 7.1 e 7.5 (regras).

**O que o emulador muda na prova (LLD, seção 4.6).** O emulador reproduz o nome do arquivo no download assinado (`response-content-disposition`), então o CA2 e o CA4 conferem o nome no que o emulador entrega, e não só na URL. Ele não confere a assinatura nem a validade da URL: a validade de 5 minutos (CA1) é provada no que a API informa (`expiresAt`) e no parâmetro `X-Goog-Expires` da URL assinada, e não pelo vencimento da URL, que fica para o staging. Todo critério abaixo é provável como está escrito no Linear.

**Como o teste de API faz o `GET` da URL assinada.** O emulador só serve a URL assinada quando o `Host` da requisição é o endereço público (`STORAGE_PUBLIC_URL`), que um `fetch` não deixa definir. O teste usa `node:http` com o `Host` da URL e o endereço de `STORAGE_EMULATOR_HOST`, como o `LUI-165-CA3` (auxiliar novo em `test/support/`).

**Como o teste do navegador prepara o arquivo.** O Usuário entra pela interface, e o teste cria o envio por `POST /uploads`, envia os bytes por `PUT` da própria página (a origem que o emulador aceita) e conclui por `POST /uploads/{itemId}/complete`, como o `e2e/storage-emulator.spec.ts` já faz. Depois recarrega a lista.

**O que não tem critério.** O duplo clique sem efeito, o ícone e a posição do menu seguem o Figma e a validação visual de `docs/design-system.md`, que o script de verificação não confere.

## LUI-168-CA1

**Marca:** teste HTTP

**Cenário:** Dado um Usuário com um arquivo ativo de conteúdo `ola!!` na Pasta raiz (criado por `POST /uploads`, `PUT` à sessão e `POST /uploads/{itemId}/complete`), quando ele pede `GET /items/{id}/download-url`, então a resposta é 200 com `url` e `expiresAt`, e a diferença entre `expiresAt` e o instante do pedido é de 5 minutos (com a tolerância de poucos segundos do relógio do teste). E a `url` tem a origem de `STORAGE_PUBLIC_URL` e `X-Goog-Expires=300`. Quando o teste faz o `GET` da `url` no emulador, então a resposta é 200 com os bytes `ola!!`.

**Teste previsto:** ponta a ponta da API, `apps/api/test/items-download-url.e2e-spec.ts`, "devolve a URL assinada de um arquivo ativo, que entrega os bytes, com validade de 5 minutos @LUI-168-CA1".

## LUI-168-CA2

**Marca:** teste HTTP

**Cenário:** Dado um arquivo ativo de nome `relatório do mês.pdf` (acento e espaço), quando o Usuário pede a URL de download e o teste faz o `GET` dela no emulador, então a resposta traz `Content-Disposition: attachment; filename*=UTF-8''relat%C3%B3rio%20do%20m%C3%AAs.pdf`. E o parâmetro `response-content-disposition` da URL tem o mesmo valor, e nem esse parâmetro nem o cabeçalho trazem a chave do objeto (`objectKey` gravada no banco). A chave continua no caminho da URL assinada, porque é ela que endereça o objeto no storage: o que o ticket pede é que o nome do download seja o do Item, e não a chave.

**Teste previsto:** ponta a ponta da API, `apps/api/test/items-download-url.e2e-spec.ts`, "leva o nome original, com acento e espaço, no Content-Disposition como anexo @LUI-168-CA2".

## LUI-168-CA3

**Marca:** teste HTTP

**Cenário:** Dado um Usuário A com uma pasta ativa, um arquivo `pending` (início de envio sem conclusão) e um arquivo ativo, e um Usuário B com um arquivo ativo, quando A pede a URL de download da pasta, do arquivo `pending`, do arquivo ativo de B, de um UUID que não existe e de um texto que não é UUID, então cada resposta é 404 com `code` `not_found`, no formato do problema da API. E, para o arquivo ativo do próprio A, a resposta é 200. Sem token de acesso, a resposta é 401 `unauthenticated`.

**Teste previsto:** ponta a ponta da API, `apps/api/test/items-download-url.e2e-spec.ts`, "responde not_found para pasta, item pendente, item de outro Usuário e item inexistente @LUI-168-CA3".

## LUI-168-CA4

**Marca:** teste no Playwright

**Cenário:** Dado um Usuário com a Sessão aberta e o arquivo `relatório do mês.txt`, de conteúdo conhecido, na lista de "Meus arquivos", quando ele clica em "Mais ações" na linha do arquivo e em "Baixar" no menu, então o navegador dispara um download com o nome sugerido `relatório do mês.txt` e com o conteúdo enviado, e a página continua em "Meus arquivos".

**Teste previsto:** Playwright, `apps/web/e2e/download.spec.ts`, "o Usuário baixa um arquivo pelo Baixar do menu da linha e recebe o conteúdo com o nome original @LUI-168-CA4".

## LUI-168-CA5

**Marca:** teste no Playwright

**Cenário:** Dado um Usuário com a Sessão aberta e um arquivo na lista, quando se lê o HTML que o servidor entrega para "Meus arquivos" e o HTML da página depois de abrir o menu da linha, então nenhum dos dois contém o host do storage (`localhost:4443`), `X-Goog-Signature` nem `response-content-disposition`. E, com o menu aberto, "Baixar" é um link cujo `href` é o caminho da web `/arquivos/{id}/baixar`.

**Teste previsto:** Playwright, `apps/web/e2e/download.spec.ts`, "o HTML da lista não traz URL assinada do storage, só o caminho da web @LUI-168-CA5".

## LUI-168-CA6

**Marca:** teste no Playwright

**Cenário:** Dado um navegador sem Sessão, quando ele abre `/arquivos/{id}/baixar` de um Item qualquer, então a página termina em `/entrar` com o caminho pedido como destino (`destino=%2Farquivos%2F{id}%2Fbaixar`), e nenhum download acontece.

**Teste previsto:** Playwright, `apps/web/e2e/download.spec.ts`, "sem Sessão, a rota de download leva à tela de entrar @LUI-168-CA6".
