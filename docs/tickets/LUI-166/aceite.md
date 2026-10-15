# Aceite do LUI-166

Os critérios de contrato (CA1 a CA5) são provados pelas rotas da API, na suíte de ponta a ponta. Os de tela (CA6 a CA9), no navegador. Até o upload existir, os Itens que a lista mostra são gravados direto no banco como preparação: nos testes da API, no banco de testes; nos do navegador, no banco da API que a web usa.

## LUI-166-CA1

**Marca:** teste HTTP

**Cenário:** Dado um Usuário verificado e com Sessão, que nunca usou a Pasta raiz, quando ele pede `GET /v1/items/root/children`, então a resposta é 200 com `items` vazio e `nextCursor` nulo, sem a própria Pasta raiz na lista.

**Teste previsto:** ponta a ponta da API, `apps/api/test/items-root-children.e2e-spec.ts`, "responde a lista vazia, sem a própria raiz, para um Usuário novo @LUI-166-CA1".

## LUI-166-CA2

**Marca:** teste HTTP

**Cenário:** Dado um Usuário verificado e com Sessão, que nunca usou a Pasta raiz, quando ele faz dez chamadas simultâneas a `GET /v1/items/root/children`, então todas respondem 200 com `items` vazio.

**Teste previsto:** ponta a ponta da API, `apps/api/test/items-root-children.e2e-spec.ts`, "responde 200 a todas as chamadas simultâneas no primeiro uso da raiz @LUI-166-CA2".

## LUI-166-CA3

**Marca:** teste HTTP

**Cenário:** Dado um Usuário com, na Pasta raiz, as pastas ativas `b-pasta` e `a-pasta`, os arquivos ativos `c.txt` e `a.txt`, um arquivo pendente e um na lixeira, e um arquivo ativo dentro de `a-pasta`, e outro Usuário com um arquivo ativo na raiz dele, quando o primeiro pede `GET /v1/items/root/children`, então a resposta traz só `a-pasta`, `b-pasta`, `a.txt` e `c.txt`, nesta ordem, cada um com id, tipo, nome, tamanho, tipo MIME e data de modificação.

**Teste previsto:** ponta a ponta da API, `apps/api/test/items-root-children.e2e-spec.ts`, "traz só os Itens ativos da raiz do Usuário, pastas primeiro e depois por nome @LUI-166-CA3".

## LUI-166-CA4

**Marca:** teste HTTP

**Cenário:** Dado um Usuário com cinco arquivos ativos na raiz, três deles com o mesmo nome, quando ele pede a lista com `limit=2` e segue o `nextCursor` até ele vir nulo, então as páginas trazem 2, 2 e 1 Itens, só a última vem com `nextCursor` nulo, e as páginas juntas trazem os cinco Itens, cada um uma vez, na ordem da lista sem paginação. Dado um Usuário com 201 arquivos ativos na raiz, quando ele pede a lista sem `limit`, com `limit=200` e com `limit=201`, então as duas primeiras trazem 50 e 200 Itens, as duas com `nextCursor`, e a terceira responde 400 com `validation_error`.

**Teste previsto:** ponta a ponta da API, `apps/api/test/items-root-children.e2e-spec.ts`, "pagina por cursor sem repetir nem pular Itens, mesmo com nomes iguais @LUI-166-CA4" e "usa 50 Itens por página por padrão, aceita até 200 e recusa um limit acima do máximo @LUI-166-CA4".

## LUI-166-CA5

**Marca:** teste HTTP

**Cenário:** Dado um pedido sem o cabeçalho `Authorization`, quando ele chama `GET /v1/items/root/children`, então a resposta é 401 com `unauthenticated`.

**Teste previsto:** ponta a ponta da API, `apps/api/test/items-root-children.e2e-spec.ts`, "responde unauthenticated sem token de acesso @LUI-166-CA5".

## LUI-166-CA6

**Marca:** teste no Playwright

**Cenário:** Dado um Usuário verificado, quando ele entra pela tela de entrar, então ele chega a `/` e vê a casca do Drive: a marca do produto, o botão do menu da conta e, na navegação, o item "Meus arquivos" marcado como a página atual; e a área de conteúdo tem o título "Meus arquivos".

**Teste previsto:** navegador, `apps/web/e2e/drive.spec.ts`, "depois de entrar, o Usuário vê \"Meus arquivos\" na casca do Drive @LUI-166-CA6".

## LUI-166-CA7

**Marca:** teste no Playwright

**Cenário:** Dado um Usuário que entrou e não tem Itens na raiz, quando a tela "Meus arquivos" abre, então ela mostra o estado vazio de pasta vazia desenhado no Figma, com o título e o convite para enviar arquivos, e nenhuma lista de arquivos.

**Teste previsto:** navegador, `apps/web/e2e/drive.spec.ts`, "a Pasta raiz vazia mostra o estado vazio com o convite para enviar arquivos @LUI-166-CA7".

## LUI-166-CA8

**Marca:** teste no Playwright

**Cenário:** Dado um Usuário com 51 arquivos ativos na raiz, um deles com nome, tipo MIME, tamanho e data de modificação conhecidos, quando a tela "Meus arquivos" abre, então a lista mostra 50 linhas, e a linha desse arquivo mostra o nome, o rótulo do tipo, o tamanho formatado e a data; quando ele clica em "Carregar mais", então a 51ª linha aparece no fim, as 50 anteriores continuam, a URL não muda e o botão "Carregar mais" some.

**Teste previsto:** navegador, `apps/web/e2e/drive.spec.ts`, "a lista mostra nome, tipo, tamanho e data, e \"Carregar mais\" acrescenta a página seguinte até o fim @LUI-166-CA8".

## LUI-166-CA9

**Marca:** teste no Playwright

**Cenário:** Dado um Usuário que entrou e está em "Meus arquivos", quando ele abre o menu da conta e escolhe "Sair", então ele chega à tela de entrar, sem os cookies de token; e, com o token de renovação de antes de sair devolvido ao navegador, abrir `/` leva à tela de entrar com o aviso de Sessão expirada, porque a Sessão acabou também na API.

**Teste previsto:** navegador, `apps/web/e2e/drive.spec.ts`, "sair pelo menu da conta encerra a Sessão e leva à tela de entrar @LUI-166-CA9".
