# Aceite do LUI-169

Os critérios de teste (CA1 a CA5) são provados na suíte de ponta a ponta da API, com o PostgreSQL de testes e o emulador de storage reais. O teste prepara pelas rotas (`POST /uploads`, o `PUT` dos bytes no emulador, `POST /uploads/{itemId}/complete`) e confere pelas rotas e pela Cota. O Act é a limpeza, chamada pela mesma função que o comando roda, sobre a aplicação de teste. O CA6 é conferido pela leitura do diff. O desenho está no `docs/lld.md`, seções 4.6 e 5 (a limpeza por comando antes do worker), e na tabela de variáveis da seção 6 (`PENDING_UPLOAD_TTL_HOURS`).

**Como o teste roda o comando.** O comando abre a aplicação sem o servidor HTTP (`NestFactory.createApplicationContext`), como o gerador da OpenAPI, e chama o método de limpeza do service de uploads, que lê o prazo da configuração. O teste chama a mesma função de entrada do comando com a aplicação de teste, e não um processo à parte, para o Act ser um só e o banco ser o de testes. O prazo zero entra pela configuração da aplicação de teste (a variável do prazo com valor 0), e não por argumento do método.

**Como o teste vê a Cota.** O `GET /me` ainda não devolve o uso da Cota, então o teste lê o `used_bytes` pelo auxiliar que o LUI-167 já usa em `test/support/uploads.ts`. Onde dá, a Cota também aparece pelo comportamento: um envio que não cabia antes da limpeza passa a caber depois.

**A consulta do upload.** O `GET /uploads/{itemId}` é da retomada (LUI-171) e ainda não existe. O CA5 prova a parte de hoje, a conclusão, e a consulta entra no teste quando a rota existir, no ticket dela. Esta é uma decisão em aberto do plano.

## LUI-169-CA1

**Marca:** teste HTTP

**Cenário:** Dado um Usuário com dois envios pendentes (um sem bytes no storage e outro com os bytes enviados por `PUT`, mas sem a conclusão) e a Cota reservada para os dois, e a aplicação com o prazo de upload pendente igual a zero, quando a limpeza roda, então os dois Itens deixam de existir, a sessão e o objeto do segundo deixam de existir no emulador (o tamanho lido pela interface de storage é nulo), e o `used_bytes` volta ao valor de antes dos dois envios. E um envio do mesmo tamanho somado, que antes respondia `quota_exceeded` com a Cota quase cheia, passa a ser aceito.

**Teste previsto:** ponta a ponta da API, `apps/api/test/uploads-cleanup.e2e-spec.ts`, "remove os uploads pendentes vencidos e devolve o espaço reservado à Cota @LUI-169-CA1".

## LUI-169-CA2

**Marca:** teste HTTP

**Cenário:** Dado um envio pendente recém-criado e a aplicação com o prazo padrão de 24 horas, quando a limpeza roda, então o Item continua pendente e a Cota continua reservada; e, depois de enviar os bytes por `PUT`, `POST /uploads/{itemId}/complete` responde 200 com o Item `active`.

**Teste previsto:** ponta a ponta da API, `apps/api/test/uploads-cleanup.e2e-spec.ts`, "mantém o upload pendente dentro do prazo, que ainda pode ser concluído @LUI-169-CA2".

## LUI-169-CA3

**Marca:** teste HTTP

**Cenário:** Dado um arquivo `active` na Pasta raiz, com data de criação de 30 dias atrás, e a aplicação com o prazo igual a zero, quando a limpeza roda, então `GET /items/root/children` ainda lista o arquivo, o `GET /items/{id}/download-url` dele responde 200, e o `used_bytes` não muda.

**Teste previsto:** ponta a ponta da API, `apps/api/test/uploads-cleanup.e2e-spec.ts`, "nunca remove um arquivo ativo, por mais antigo que seja @LUI-169-CA3".

## LUI-169-CA4

**Marca:** teste HTTP

**Cenário:** Dado um envio pendente com a Cota reservada e a aplicação com o prazo igual a zero, quando a limpeza roda duas vezes seguidas, então o `used_bytes` cai uma vez só, pelo tamanho do envio, e a segunda execução termina sem erro e sem remover nada.

**Teste previsto:** ponta a ponta da API, `apps/api/test/uploads-cleanup.e2e-spec.ts`, "devolve o espaço uma vez só quando a limpeza roda duas vezes @LUI-169-CA4".

## LUI-169-CA5

**Marca:** teste HTTP

**Cenário:** Dado um envio pendente com os bytes enviados e a aplicação com o prazo igual a zero, quando a limpeza roda, então `POST /uploads/{itemId}/complete` responde 404 com `code` `not_found`, e não `upload_incomplete` nem 200. A consulta (`GET /uploads/{itemId}`) entra neste teste quando a rota existir (LUI-171).

**Teste previsto:** ponta a ponta da API, `apps/api/test/uploads-cleanup.e2e-spec.ts`, "o upload removido pela limpeza responde not_found na conclusão @LUI-169-CA5".

## LUI-169-CA6

**Marca:** documento

**Cenário:** Dado o `apps/api/AGENTS.md`, o `apps/api/.env.example` e o `docs/lld.md` deste PR, quando são lidos, então o `AGENTS.md` da API traz o comando da limpeza, o comando para rodá-lo no contêiner `api` e a variável `PENDING_UPLOAD_TTL_HOURS`, com o padrão de 24 horas; o `.env.example` traz a variável com o valor padrão; e a seção 5 do LLD descreve a limpeza por comando antes do worker, com a ordem storage antes do banco e o código de saída.
