# Aceite do LUI-179

Ticket de navegar entre pastas e criar pastas. Os CA1 a CA6 são provados por testes HTTP da API (um arquivo de ponta a ponta, com o PostgreSQL de testes real), os CA7 a CA11, por testes no Playwright, e o CA12, pela leitura do `docs/lld.md` no diff do PR.

Os testes HTTP preparam pastas e arquivos direto no banco (`itemRoutes(app).seed`), porque a árvore de que precisam, inclusive a de 50 níveis do CA5, não se monta por rotas sem repetir o que o CA3 já prova. Quem cria pasta pela rota real é o teste do CA3 e os do navegador. Um item `pending` entra no CA1 e no CA2 por essa mesma preparação, já que a rota que o cria é a do upload.

A profundidade conta as pastas do caminho, sem a Pasta raiz: uma pasta direto em "Meus arquivos" está no nível 1, e o 50º nível é a última pasta que pode existir. O CA5 monta uma cadeia de 50 pastas e confere os dois lados do limite.

Os testes no navegador seguem o estilo de `drive.spec.ts`: um Usuário verificado, a árvore preparada no banco por auxiliares de `e2e/support/items.ts` (que ganha o de pastas) e as telas lidas pelos papéis e nomes que o usuário vê. O CA10 confere o celular com a janela em 390 px, e a aparência de cada tela, a conferência com o Figma do LUI-178, que é da validação visual do `docs/design-system.md`, e não deste arquivo.

## LUI-179-CA1

**Marca:** teste HTTP

**Cenário:** Dado um Usuário com uma cadeia de três pastas dentro da raiz, quando ele pede `GET /items/{id}` da terceira pasta, então recebe o Item e a trilha com "Meus arquivos" e as três pastas, do topo até ela, e o atalho `root` devolve a trilha só com a raiz. Dado o mesmo pedido com um id inexistente, com o id de uma pasta de outro Usuário, com o de um arquivo, com um texto que não é UUID e com o de um Item `pending`, então cada um responde `not_found`.

**Teste previsto:** testes de ponta a ponta da API, `items-folders.e2e-spec.ts`, "responde a trilha do topo até a pasta" e "responde not_found à trilha de um id que não é de uma pasta ativa do Usuário".

## LUI-179-CA2

**Marca:** teste HTTP

**Cenário:** Dado um Usuário com uma pasta que tem pastas, arquivos e um Item `pending` dentro, quando ele pede `GET /items/{pasta}/children`, então recebe só os Itens ativos, pastas primeiro e depois por nome, e com `limit` menor que o total a resposta traz `nextCursor` e a página seguinte continua sem repetir nem pular. Com `type=folder`, só as pastas voltam, também paginadas. Um `type` que não é `folder` responde `validation_error`, e uma pasta inexistente, de outro Usuário ou que é arquivo responde `not_found`.

**Teste previsto:** testes de ponta a ponta da API, `items-folders.e2e-spec.ts`, "lista os filhos de uma pasta, paginada e na ordem do contrato", "filtra só as pastas com type=folder" e "responde not_found à lista de uma pasta que não é do Usuário".

## LUI-179-CA3

**Marca:** teste HTTP

**Cenário:** Dado um Usuário com uma pasta chamada "Fotos" na raiz, quando ele cria, por `POST /folders`, a pasta "  Fotos  " na raiz e outra na pasta, então cada resposta é 201 com a pasta criada, de nome "Fotos" sem os espaços das pontas, e a lista da pasta de destino a traz, com o nome igual ao do irmão aceito.

**Teste previsto:** testes de ponta a ponta da API, `items-folders.e2e-spec.ts`, "cria a pasta sem os espaços das pontas e aceita nome igual".

## LUI-179-CA4

**Marca:** teste HTTP

**Cenário:** Dado um Usuário com a raiz, quando ele cria uma pasta com o nome vazio, só de espaços, com `/`, com 256 caracteres ou sem o campo, então cada pedido responde `validation_error`, e a lista da raiz continua sem pasta nova. Um nome com 255 caracteres, e outro cujo comprimento só passa de 255 por causa dos espaços das pontas, são aceitos.

**Teste previsto:** testes de ponta a ponta da API, `items-folders.e2e-spec.ts`, "recusa o nome inválido com validation_error" e "mede os 255 caracteres depois de descartar os espaços das pontas".

## LUI-179-CA5

**Marca:** teste HTTP

**Cenário:** Dado um Usuário, quando ele cria uma pasta num destino que não existe, que não é UUID, que é arquivo, que é de outro Usuário ou que é um Item `pending`, então cada pedido responde `not_found`. Dada uma cadeia de 50 pastas, quando ele cria uma dentro da de nível 49, então responde 201 (a pasta nasce no nível 50), e dentro da de nível 50 responde `max_depth_exceeded`, sem criar nada.

**Teste previsto:** testes de ponta a ponta da API, `items-folders.e2e-spec.ts`, "responde not_found a um destino que não é uma pasta ativa do Usuário" e "cria até o 50º nível e recusa o 51º com max_depth_exceeded".

## LUI-179-CA6

**Marca:** teste HTTP

**Cenário:** Dado um Usuário com a conta em modo somente leitura (a cota usada acima do espaço do plano), quando ele cria uma pasta, então a resposta é 201, e `GET /me` continua com o mesmo `usedBytes` e `readOnly` verdadeiro.

**Teste previsto:** testes de ponta a ponta da API, `items-folders.e2e-spec.ts`, "cria a pasta com a conta somente leitura, sem mexer na Cota".

## LUI-179-CA7

**Marca:** teste no Playwright

**Cenário:** Dado um Usuário com a pasta "Projetos", que tem a subpasta "2026" com um arquivo, quando ele abre "Projetos" e depois "2026" por duplo clique, então o endereço de cada uma é `/pasta/<id>`, o breadcrumb mostra "Meus arquivos", "Projetos" e "2026" (a última sem link) e a lista traz o conteúdo da pasta aberta. Quando ele clica em "Projetos" no breadcrumb, volta a ela, e o botão "voltar" do navegador leva à pasta anterior. Recarregar a página numa pasta a mantém aberta.

**Teste previsto:** testes no navegador, `folders.spec.ts`, "o Usuário abre pastas por duplo clique e volta pelo breadcrumb".

## LUI-179-CA8

**Marca:** teste no Playwright

**Cenário:** Dado um Usuário dentro de uma pasta, quando ele aperta "Nova pasta", digita um nome com espaços nas pontas e confirma, então o diálogo fecha, o endereço continua o da pasta, a nova pasta aparece na lista com o nome sem os espaços e um aviso de confirmação é mostrado. Quando ele confirma um nome só de espaços, o diálogo continua aberto com o erro em português junto do campo e nenhuma pasta é criada. Quando a árvore já está no 50º nível, o erro de profundidade aparece em português no diálogo.

**Teste previsto:** testes no navegador, `folders.spec.ts`, "Nova pasta cria a pasta na pasta atual, avisa e fica nela" e "Nova pasta mostra o erro em português quando o nome é inválido ou a árvore está no limite".

## LUI-179-CA9

**Marca:** teste no Playwright

**Cenário:** Dado um Usuário, quando ele abre o endereço `/pasta/<id>` de uma pasta que não existe, de uma de outro Usuário, de um arquivo e de um texto que não é UUID, então cada um mostra a página de "não encontrado" da casca do Drive, com o caminho de volta a "Meus arquivos", e a Sessão continua aberta.

**Teste previsto:** testes no navegador, `folders.spec.ts`, "o endereço de uma pasta que não é do Usuário mostra a página de não encontrado".

## LUI-179-CA10

**Marca:** teste no Playwright

**Cenário:** Dado um Usuário com uma pasta de 60 Itens, quando ele a abre, então a lista mostra 50 e, ao apertar "Carregar mais", os outros 10 são acrescentados e o botão some. Dada uma janela de 390 px e uma pasta no 5º nível, quando ele a abre, então o breadcrumb mostra "Meus arquivos", o "…" e a pasta atual; o "…" abre um menu com as pastas do meio, e escolher uma delas leva a ela.

**Teste previsto:** testes no navegador, `folders.spec.ts`, "Carregar mais acrescenta a página seguinte de uma pasta longa" e "no celular o breadcrumb longo colapsa os trechos do meio num menu".

## LUI-179-CA11

**Marca:** teste no Playwright

**Cenário:** Dado um Usuário dentro de uma pasta, quando ele escolhe um arquivo pelo botão "Enviar", então o envio conclui e o arquivo aparece na lista dessa pasta e não na de "Meus arquivos". Quando ele envia outro arquivo estando na raiz, o arquivo aparece na raiz.

**Teste previsto:** testes no navegador, `folders.spec.ts`, "os arquivos enviados com o botão Enviar vão para a pasta aberta".

## LUI-179-CA12

**Marca:** documento

**Cenário:** Dado o `docs/lld.md`, quando se leem a seção de itens da API, a de estados e regras do Item e o mapa de rotas da web, então o filtro `type=folder` da lista de filhos, a regra de que a lista aceita qualquer pasta ativa do Usuário, a rota `/pasta/[id]` com a situação "Existe" e o lock consultivo por Usuário que serializa as gravações que mudam a árvore estão registrados.
