# Aceite do LUI-165

O ticket prova, contra o `fake-gcs-server`, o que o upload e o download vão usar. Os critérios de interface (CA2 a CA4) são provados na suíte de integração da API, que fala com o emulador real. Os de navegador (CA5 a CA7) rodam no Playwright, no serviço `playwright`, contra o emulador e a API reais. O desenho (interface, variáveis, endereço público e assinatura local) está no `docs/lld.md`, seção 4.6.

**Como o navegador chega a um endereço que o emulador atende.** A API fala com o emulador por `http://storage:4443`, e o navegador de quem desenvolve só alcança `http://localhost:4443`, a porta que o Compose publica. O emulador monta o endereço da sessão com o `Host` da requisição que recebeu, e só serve a URL assinada (`/<bucket>/<objeto>`) quando o `Host` é igual ao `-public-host` dele. Por isso a implementação troca a origem do endereço da sessão por `STORAGE_PUBLIC_URL`, passa a mesma origem como `host` da URL assinada, e o serviço sobe com `-public-host localhost:4443`. O navegador do serviço `playwright` roda noutro contêiner, onde `localhost` não é o storage: a configuração do Playwright mapeia o nome `localhost` para `storage` no navegador (`--host-resolver-rules`), e a página continua em `http://web:3000`. Assim o endereço é o mesmo nos dois navegadores, e o teste prova o que a pessoa vê.

**Como o teste no navegador obtém as URLs.** Não existe rota de negócio de upload neste ticket, e o Playwright não alcança o Nest. As três URLs e a conferência de tamanho saem de uma rota de apoio da API (`/v1/dev/storage/...`, montada só quando `STORAGE_EMULATOR_HOST` existe, fora do OpenAPI), que só chama a interface de storage. Ela sai quando o `POST /uploads` do LUI-167 existir.

**O que o emulador não reproduz** (achado durante o plano, contra a versão 1.56.1; o registro nos documentos é o CA8):

- O endereço da sessão sai com o host da requisição, e não com o `-external-url`.
- A consulta de progresso (`Content-Range: bytes */<total>`, sem corpo) não consulta: o emulador a trata como o fim do envio, cria o objeto com o que já recebeu, apaga a sessão e responde 200. O chunk seguinte recebe 404.
- O CORS é fixo no emulador (qualquer origem, e só o cabeçalho `Location` exposto). A resposta 308 chega ao navegador sem o `Range` legível, e a origem do frontend não é restringida.
- O cancelamento da sessão (`DELETE` no endereço dela) só responde 499, e a sessão continua aceitando bytes.
- A URL assinada é servida sem conferir a assinatura nem a validade. O `response-content-disposition` é respeitado.
- O tamanho do chunk não precisa ser múltiplo de 256 KiB.

**Pendência antes de aprovar o plano.** Por esses achados, o CA5 não é provável como está escrito no Linear (a leitura do `Range` no navegador e a consulta de progresso), e o CA4 prova só a chamada de cancelamento, e não o efeito dela. O cenário do CA5 abaixo é o do critério, e traz marcado o que o emulador não permite. Quem aprova decide: reduzir o critério ao que o emulador faz e registrar o resto como divergência coberta no staging, como o ticket prevê. O arquivo de aceite só congela no commit de plano.

## LUI-165-CA1

**Marca:** revisão humana

**Cenário:** Dado um ambiente sem contêineres, quando se roda `docker compose -f compose.dev.yaml up -d --build --wait`, então o serviço `storage` fica saudável junto com os outros, sem nenhum passo manual. E, com o ambiente no ar, `GET http://localhost:4443/storage/v1/b/app-files` responde 200, ou seja, o bucket já existe. E o `compose.dev.yaml` fixa a versão do emulador (`fsouza/fake-gcs-server:1.56.1`) e publica a porta 4443.

## LUI-165-CA2

**Marca:** teste de integração

**Cenário:** Dado o módulo de storage montado com a configuração do ambiente (emulador e bucket reais), quando a interface cria uma sessão de upload com a origem do frontend, então o endereço devolvido tem a origem de `STORAGE_PUBLIC_URL` e não a do serviço `storage`. Quando se envia ao emulador, por esse endereço (trocando a origem pelo `STORAGE_EMULATOR_HOST`, porque o contêiner da API não alcança o endereço público), um objeto de 5 bytes em um único `PUT`, então `getObjectSize` devolve 5. E, para um objeto que nunca foi enviado, `getObjectSize` devolve `null`.

**Teste previsto:** integração da API, `apps/api/src/infra/storage/gcs-file-storage.int-spec.ts`, "cria a sessão com o endereço público e lê o tamanho do objeto enviado @LUI-165-CA2".

## LUI-165-CA3

**Marca:** teste de integração

**Cenário:** Dado um objeto de 5 bytes no bucket, quando a interface assina a URL de leitura com o nome de arquivo `relatório.pdf`, então a URL tem a origem de `STORAGE_PUBLIC_URL`. Quando se faz o `GET` dela no emulador (com o `Host` do endereço público, que um `fetch` não deixa definir, então por `node:http`), então a resposta é 200 com os 5 bytes e com `Content-Disposition: attachment; filename*=UTF-8''relat%C3%B3rio.pdf`.

**Teste previsto:** integração da API, `apps/api/src/infra/storage/gcs-file-storage.int-spec.ts`, "assina uma URL de leitura que devolve os bytes do objeto, com o nome do arquivo @LUI-165-CA3".

## LUI-165-CA4

**Marca:** teste de integração

**Cenário:** Dado um objeto no bucket, quando a interface o apaga, então `getObjectSize` devolve `null`, e apagar de novo o mesmo objeto não é erro. Dada uma sessão de upload ainda sem bytes, quando a interface a cancela, então a chamada termina sem erro (o emulador responde 499, que é a resposta do Cloud Storage a um cancelamento), e cancelar de novo a mesma sessão também não é erro. O emulador não encerra a sessão, então este teste não prova que ela deixa de aceitar bytes: isso fica para o staging.

**Teste previsto:** integração da API, `apps/api/src/infra/storage/gcs-file-storage.int-spec.ts`, "apaga o objeto e cancela a sessão, sem erro se repetir @LUI-165-CA4".

## LUI-165-CA5

**Marca:** teste no Playwright

**Cenário:** Dado um arquivo de 512 KiB e uma sessão de upload criada pela rota de apoio (com a origem do frontend da configuração), quando a página (em `http://web:3000`) envia o primeiro chunk de 256 KiB por `PUT` com `Content-Range: bytes 0-262143/524288`, então a resposta é 308. Quando envia o segundo chunk, `bytes 262144-524287/524288`, então a resposta é 200, e a rota de apoio lê 524288 bytes no objeto. A leitura do `Range` do 308 pela página e a consulta de progresso sem corpo não são provadas aqui: o emulador não expõe o cabeçalho e trata a consulta como o fim do envio. Ficam registradas como divergência (CA8) e cobertas no staging.

**Teste previsto:** Playwright, `apps/web/e2e/storage-emulator.spec.ts`, "envia o arquivo em 2 chunks, com 308 no primeiro e 200 no segundo @LUI-165-CA5".

## LUI-165-CA6

**Marca:** teste no Playwright

**Cenário:** Dado um arquivo vazio e uma sessão de upload criada pela rota de apoio, quando a página faz um único `PUT` sem corpo na sessão, então a resposta é 200 e a rota de apoio lê tamanho 0 no objeto.

**Teste previsto:** Playwright, `apps/web/e2e/storage-emulator.spec.ts`, "envia um arquivo vazio num único PUT @LUI-165-CA6".

## LUI-165-CA7

**Marca:** teste no Playwright

**Cenário:** Dado um objeto enviado pelo navegador e as URLs de sessão e de leitura devolvidas pela rota de apoio, quando se lê o host delas, então é o de `STORAGE_PUBLIC_URL` (`localhost:4443`) e não `storage`. Quando a página faz a chamada à URL de sessão, ela é atendida (o navegador alcança o endereço). Quando o navegador abre a URL de leitura, ele baixa o arquivo com os bytes enviados e com o nome sugerido igual ao nome do arquivo (por exemplo `relatório.pdf`).

**Teste previsto:** Playwright, `apps/web/e2e/storage-emulator.spec.ts`, "entrega ao navegador URLs de sessão e de download que ele alcança @LUI-165-CA7".

## LUI-165-CA8

**Marca:** documento

**Cenário:** Dado o `docs/hld.md` e o `docs/lld.md`, quando se lê a seção 6.1 do HLD, a pergunta em aberto sobre o emulador e a seção 4.6 do LLD, então a pergunta aberta do HLD está marcada como fechada, a lista "o que o ambiente local não reproduz" do HLD traz as divergências medidas (a lista acima: endereço da sessão pelo `Host`, consulta de progresso que encerra o envio, CORS fixo sem `Range`, cancelamento que só responde 499, assinatura e validade sem conferência, tamanho do chunk) com o aviso de que são cobertas no staging, os "pontos de implementação a validar" do LLD viram o resultado (a origem entra na criação da sessão e vale para a sessão; o CORS do bucket não é configurável no emulador, e o `Range` fica ilegível para o navegador), e o nome do arquivo no download assinado está registrado como reproduzido pelo emulador (`response-content-disposition`). E a tabela de serviços do `AGENTS.md` da raiz lista o `storage`.
