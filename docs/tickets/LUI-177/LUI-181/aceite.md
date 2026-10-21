# Aceite do LUI-181

Ticket de mover pastas e arquivos. Os CA1 a CA7 são provados por testes HTTP da API (um arquivo de ponta a ponta, com o PostgreSQL de testes real), os CA8 a CA12, por testes no Playwright, e o CA13, pela leitura do `docs/lld.md` no diff do PR.

Os testes HTTP preparam a árvore direto no banco (`itemRoutes(app).seed`), como os do LUI-179 e do LUI-180: as cadeias de 50 níveis do CA4 não se montam por rotas sem repetir o que o LUI-179 já prova, e a rota que o ticket exercita é só a de mover. O lugar novo de um Item é conferido pelas listas da origem e do destino (`GET /items/{id}/children`), porque o Item da resposta não traz o pai.

A profundidade segue a do LUI-179: conta as pastas do caminho, sem a Pasta raiz, e o 50º nível é o último que pode existir. A altura da subárvore movida conta a própria pasta e as pastas abaixo dela; um arquivo não tem altura e nunca passa do limite, porque o destino é sempre uma pasta que já existe. O movimento é aceito quando a profundidade do destino mais a altura da subárvore não passa de 50.

A Pasta raiz não se move, e a recusa é `invalid_move`, como a spec decide, e não o `validation_error` do renomear: mover a raiz é um movimento impossível na árvore. O atalho `root` vale no caminho e no `parentId`. O CA7 dispara os dois pedidos ao mesmo tempo e confere o resultado, e não a ordem: o lock consultivo por Usuário é o que garante que só um passa, e o teste não o observa direto.

Os testes no navegador seguem o estilo de `rename.spec.ts`: um Usuário verificado, a árvore preparada no banco por `e2e/support/items.ts` e as telas lidas pelos papéis e nomes que o Usuário vê. O seletor começa em "Meus arquivos" e só entra numa pasta pelo clique nela, então as descendentes da pasta movida, que fica desabilitada, nunca são oferecidas. O CA11 confere o celular com a janela em 390 px. A aparência do diálogo é a conferência com o Figma do LUI-178, da validação visual do `docs/design-system.md`, e não deste arquivo.

## LUI-181-CA1

**Marca:** teste HTTP

**Cenário:** Dado um Usuário com as pastas "Origem" e "Destino" na raiz, e dentro de "Origem" uma pasta e um arquivo com a data de modificação antiga, quando ele pede `PATCH /items/{id}` de cada um com o `parentId` de "Destino", então cada resposta é 200 com o Item de mesmo id e nome e `updatedAt` posterior ao anterior, a lista de "Destino" passa a mostrar os dois e a de "Origem" fica vazia. Dados outra pasta e outro arquivo dentro de "Origem", quando ele os move com `parentId` `root`, então a lista da raiz passa a mostrá-los e a de "Origem" não.

**Teste previsto:** testes de ponta a ponta da API, `items-move.e2e-spec.ts`, "move a pasta e o arquivo para outra pasta" e "move a pasta e o arquivo para a Pasta raiz pelo atalho root".

## LUI-181-CA2

**Marca:** teste HTTP

**Cenário:** Dada a cadeia de pastas A, B dentro de A e C dentro de B, quando o Usuário pede `PATCH /items/{A}` com o `parentId` de A, de B e de C, então cada pedido responde `invalid_move`, e as listas da raiz, de A e de B continuam as de antes.

**Teste previsto:** testes de ponta a ponta da API, `items-move.e2e-spec.ts`, "recusa mover a pasta para dentro dela mesma ou de uma descendente".

## LUI-181-CA3

**Marca:** teste HTTP

**Cenário:** Dado um Usuário com a Pasta raiz e uma pasta dentro dela, quando ele pede `PATCH /items/{id da raiz}` e `PATCH /items/root` com o `parentId` da pasta, então cada pedido responde `invalid_move`, e a trilha de `GET /items/root` continua só com "Meus arquivos".

**Teste previsto:** testes de ponta a ponta da API, `items-move.e2e-spec.ts`, "recusa mover a Pasta raiz, pelo id e pelo atalho root".

## LUI-181-CA4

**Marca:** teste HTTP

**Cenário:** Dada uma pasta X na raiz com uma cadeia de 9 pastas abaixo dela (altura 10) e uma cadeia de 41 pastas na raiz, quando o Usuário move X para a 41ª pasta (41 + 10 = 51), então o pedido responde `max_depth_exceeded` e X continua na raiz. Quando ele move X para a 40ª pasta (40 + 10 = 50), então o pedido responde 200, e a trilha da última pasta de X tem 50 pastas abaixo de "Meus arquivos".

**Teste previsto:** testes de ponta a ponta da API, `items-move.e2e-spec.ts`, "recusa o movimento que passa de 50 níveis pela altura da subárvore" e "aceita o movimento que chega a exatamente 50 níveis".

## LUI-181-CA5

**Marca:** teste HTTP

**Cenário:** Dados uma pasta e um arquivo dentro da pasta "Origem", com a data de modificação antiga, quando o Usuário pede `PATCH /items/{id}` de cada um com o `parentId` de "Origem", então cada resposta é 200 com o Item como estava, inclusive o `updatedAt` antigo, e os dois continuam na lista de "Origem". O mesmo vale para um Item da raiz movido para `root`.

**Teste previsto:** testes de ponta a ponta da API, `items-move.e2e-spec.ts`, "aceita mover para onde o Item já está, sem alterar nada".

## LUI-181-CA6

**Marca:** teste HTTP

**Cenário:** Dado um Usuário com uma pasta, quando ele a move para um arquivo dele, para uma pasta de outro Usuário, para um id inexistente e para um texto que não é UUID, então cada pedido responde `not_found`, e a pasta continua no lugar. Quando ele move para uma pasta dele um Item de outro Usuário e um arquivo `pending` dele, então cada pedido responde `not_found`. Sem o token de acesso, o pedido responde `unauthenticated`.

**Teste previsto:** testes de ponta a ponta da API, `items-move.e2e-spec.ts`, "responde not_found ao destino que não é uma pasta ativa do Usuário", "responde not_found ao Item que não é ativo e do Usuário" e "responde unauthenticated sem o token".

## LUI-181-CA7

**Marca:** teste HTTP

**Cenário:** Dadas as pastas A e B na raiz, quando o Usuário dispara ao mesmo tempo `PATCH /items/{A}` com o `parentId` de B e `PATCH /items/{B}` com o `parentId` de A, então exatamente um responde 200 e o outro `invalid_move`, e a trilha de A e a de B começam em "Meus arquivos", sem ciclo.

**Teste previsto:** testes de ponta a ponta da API, `items-move.e2e-spec.ts`, "aceita só um de dois movimentos simultâneos que criariam um ciclo".

## LUI-181-CA8

**Marca:** teste no Playwright

**Cenário:** Dados as pastas "Projetos" e "Fotos" e o arquivo "relatorio.txt" na raiz, quando a pessoa abre "Mais ações" do arquivo, escolhe "Mover para…", entra em "Projetos" no seletor e confirma com "Mover", então o diálogo fecha, um aviso confirma, "relatorio.txt" some da lista da raiz e aparece ao abrir "Projetos". O mesmo vale para a pasta "Fotos", movida para "Projetos".

**Teste previsto:** testes no Playwright, `move.spec.ts`, "o Usuário move um arquivo e uma pasta pelo diálogo Mover para…".

## LUI-181-CA9

**Marca:** teste no Playwright

**Cenário:** Dadas na raiz a pasta "Fotos", com a subpasta "Viagens", outra pasta "Projetos" e um arquivo, quando a pessoa abre "Mover para…" da pasta "Fotos", então o seletor mostra só as pastas "Fotos" e "Projetos", sem o arquivo; "Fotos" aparece desabilitada e o clique nela não entra, então "Viagens" nunca é oferecida; e "Projetos" está habilitada.

**Teste previsto:** testes no Playwright, `move.spec.ts`, "o seletor mostra só pastas e desabilita a pasta movida".

## LUI-181-CA10

**Marca:** teste no Playwright

**Cenário:** Dados um arquivo dentro da pasta "A", a cadeia "A", "B" dentro de "A", e 51 pastas dentro de "B", quando a pessoa abre "Mover para…" do arquivo, então o seletor começa em "Meus arquivos"; ao entrar em "A" e em "B", o caminho mostra "Meus arquivos", "A" e "B"; "B" mostra 50 pastas e "Carregar mais", que traz a 51ª; e o clique em "Meus arquivos" no caminho volta à raiz, onde "Mover" tira o arquivo de "A", que passa a aparecer na lista da raiz.

**Teste previsto:** testes no Playwright, `move.spec.ts`, "o seletor percorre os níveis, carrega mais e aceita Meus arquivos como destino".

## LUI-181-CA11

**Marca:** teste no Playwright

**Cenário:** Dado o foco no botão "Mais ações" de um arquivo, quando a pessoa o abre com Enter, escolhe "Mover para…" pelas setas e Enter, leva o foco por Tab até uma pasta do seletor, entra nela com Enter e confirma com Enter no "Mover", então o diálogo fecha e o arquivo sai da lista; e, com o diálogo aberto de novo, Esc o fecha sem mover. Com a janela em 390 px, o diálogo aberto tem a largura da janela menos as margens de 16 px.

**Teste previsto:** testes no Playwright, `move.spec.ts`, "o diálogo de mover funciona pelo teclado" e "no celular, o diálogo de mover ocupa a largura total".

## LUI-181-CA12

**Marca:** teste no Playwright

**Cenário:** Dadas na raiz a pasta "Funda", com uma cadeia de 49 pastas abaixo dela (altura 50), e a pasta "Destino", quando a pessoa abre "Mover para…" de "Funda", entra em "Destino" e confirma, então o diálogo continua aberto e mostra, em português, a mensagem do limite de 50 níveis, e "Funda" continua na lista da raiz.

**Teste previsto:** testes no Playwright, `move.spec.ts`, "o diálogo mostra o erro de profundidade, sem fechar".

## LUI-181-CA13

**Marca:** documento

**Cenário:** Dado o `docs/lld.md` do PR, quando se lê a seção 4.1, então a regra de mover conta a profundidade do destino mais a altura da subárvore, o lock consultivo vale para o mover (e não mais "no ticket de mover"), e mover para onde o Item já está, a Pasta raiz e o destino inexistente têm a resposta deste ticket; e a linha de `PATCH /items/{id}` da seção 3.3 diz que `name` e `parentId` são opcionais, com ao menos um.
