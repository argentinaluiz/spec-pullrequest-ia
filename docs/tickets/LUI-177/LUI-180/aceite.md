# Aceite do LUI-180

Ticket de renomear pastas e arquivos. Os CA1 a CA5 são provados por testes HTTP da API (um arquivo de ponta a ponta, com o PostgreSQL de testes real), e os CA6 a CA9, por testes no Playwright.

Os testes HTTP preparam pastas, arquivos e Itens `pending` direto no banco (`itemRoutes(app).seed`), como os do LUI-179: a rota de renomear é a única que eles exercitam. O CA5 é a exceção, porque precisa de um objeto no storage: envia o arquivo pelo caminho real, como os testes de `items-download-url.e2e-spec.ts`, e lê o `Content-Disposition` da URL assinada no emulador.

A Pasta raiz não se renomeia, e a recusa é um `validation_error` (400): o nome dela é fixo, então o pedido é entrada inválida. O `not_found` fica para o que o Usuário não enxerga (inexistente, de outro Usuário, `pending` ou id que não é UUID), como no resto das rotas de Itens. O atalho `root` vale na rota, como em `GET /items/{id}`, e leva à mesma recusa.

A rota é `PATCH /items/{id}`, a do LLD, com só o `name` nesta entrega: o `parentId` entra no LUI-181, que torna o `name` opcional. O corpo sem nenhum campo é, por isso, um corpo sem o `name` obrigatório.

Os testes no navegador seguem o estilo de `folders.spec.ts`: um Usuário verificado, a árvore preparada no banco por `e2e/support/items.ts` e as telas lidas pelos papéis e nomes que o Usuário vê. A data de modificação é conferida preparando o item com uma data antiga (`updatedAt`). A aparência do diálogo e do menu é a conferência com o Figma do LUI-178, da validação visual do `docs/design-system.md`, e não deste arquivo.

## LUI-180-CA1

**Marca:** teste HTTP

**Cenário:** Dado um Usuário com uma pasta e um arquivo, ambos com a data de modificação antiga, quando ele pede `PATCH /items/{id}` de cada um com o nome "  Novo nome  ", então cada resposta é 200 com o Item de nome "Novo nome", sem os espaços das pontas, e de `updatedAt` posterior ao anterior, e a lista da pasta de origem mostra o nome novo. Dado um irmão que já se chama "Novo nome", o renomear é aceito, e os dois ficam na lista.

**Teste previsto:** testes de ponta a ponta da API, `items-rename.e2e-spec.ts`, "renomeia a pasta e o arquivo, sem os espaços das pontas e com a data atualizada" e "aceita um nome igual ao de um irmão".

## LUI-180-CA2

**Marca:** teste HTTP

**Cenário:** Dado um Usuário com um arquivo, quando ele pede `PATCH /items/{id}` com o corpo sem nenhum campo, com o nome vazio, só de espaços, com `/` ou com 256 caracteres, então cada pedido responde `validation_error`, e o nome do arquivo continua o mesmo. Um nome de 255 caracteres, e outro cujo comprimento só passa de 255 por causa dos espaços das pontas, são aceitos.

**Teste previsto:** testes de ponta a ponta da API, `items-rename.e2e-spec.ts`, "recusa o nome inválido com validation_error" e "mede os 255 caracteres depois de descartar os espaços das pontas".

## LUI-180-CA3

**Marca:** teste HTTP

**Cenário:** Dado um Usuário com a Pasta raiz, quando ele pede `PATCH /items/{id da raiz}` e `PATCH /items/root` com um nome válido, então cada pedido responde `validation_error`, e a Pasta raiz continua com o nome "Meus arquivos" (lido no banco e no `GET /items/root`, pela trilha).

**Teste previsto:** testes de ponta a ponta da API, `items-rename.e2e-spec.ts`, "recusa renomear a Pasta raiz, pelo id e pelo atalho root".

## LUI-180-CA4

**Marca:** teste HTTP

**Cenário:** Dado um Usuário, quando ele renomeia um Item de outro Usuário, um id inexistente, um texto que não é UUID e um Item `pending`, então cada pedido responde `not_found`, e os nomes não mudam. Sem o token de acesso, o pedido responde `unauthenticated`.

**Teste previsto:** testes de ponta a ponta da API, `items-rename.e2e-spec.ts`, "responde not_found ao Item que não é ativo e do Usuário" e "responde unauthenticated sem o token".

## LUI-180-CA5

**Marca:** teste HTTP

**Cenário:** Dado um arquivo enviado pelo caminho real e depois renomeado para "novo.txt", quando o Usuário pede `GET /items/{id}/download-url` e abre a URL assinada no emulador, então os bytes são os do arquivo e o `Content-Disposition` traz o nome "novo.txt", e não o original.

**Teste previsto:** testes de ponta a ponta da API, `items-rename.e2e-spec.ts`, "entrega o download com o nome novo".

## LUI-180-CA6

**Marca:** teste no Playwright

**Cenário:** Dado um Usuário com a pasta "Fotos" e o arquivo "relatorio.txt", este com a data de modificação antiga, quando ele abre "Mais ações" da linha, escolhe "Renomear", vê o campo com o nome atual todo selecionado (a extensão inclusive), digita outro nome e confirma, então o diálogo fecha, um aviso confirma, a lista mostra o nome novo (no arquivo, também a data de modificação nova) e o nome antigo some. O mesmo vale para a pasta, que passa a ter o botão "Mais ações".

**Teste previsto:** testes no Playwright, `rename.spec.ts`, "o Usuário renomeia um arquivo pelo diálogo, que abre com o nome selecionado" e "o Usuário renomeia uma pasta pelo menu da linha".

## LUI-180-CA7

**Marca:** teste no Playwright

**Cenário:** Dado o diálogo de renomear aberto, quando a pessoa confirma com o campo vazio e depois com um nome que tem `/`, então o diálogo continua aberto e mostra o erro em português abaixo do campo, e o nome na lista não muda.

**Teste previsto:** testes no Playwright, `rename.spec.ts`, "o diálogo mostra o erro do nome inválido, sem fechar".

## LUI-180-CA8

**Marca:** teste no Playwright

**Cenário:** Dada uma pasta e um arquivo na lista, quando a pessoa abre o menu "Mais ações" de cada linha, então o da pasta tem "Renomear" e o do arquivo tem "Baixar" e "Renomear", e nenhum dos dois tem "Excluir".

**Teste previsto:** testes no Playwright, `rename.spec.ts`, "os menus da pasta e do arquivo não têm Excluir".

## LUI-180-CA9

**Marca:** teste no Playwright

**Cenário:** Dado o foco no botão "Mais ações" de um arquivo, quando a pessoa o abre com Enter, escolhe "Renomear" pelas setas e Enter, digita o nome novo e confirma com Enter, então o diálogo fecha e a lista mostra o nome novo; e, com o diálogo aberto de novo, Esc o fecha sem renomear.

**Teste previsto:** testes no Playwright, `rename.spec.ts`, "o diálogo de renomear abre, confirma e fecha pelo teclado".
