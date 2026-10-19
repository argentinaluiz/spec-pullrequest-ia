# Aceite do LUI-184

Ticket de harness: o ambiente de desenvolvimento passa a seguir um slot, lido de um `.env` na raiz do checkout. O CA1 a CA3 são provados por testes de unidade em shell, que rodam na máquina com o `docker compose config` e entram no relatório dos testes em shell com a tag `@LUI-184-CA<n>`. O CA4 e o CA5 exigem dois ambientes e um worktree de verdade no ar, e são de revisão humana, com a evidência no PR. O CA6 é lido no diff.

Os testes resolvem a configuração pelo `docker compose -f compose.dev.yaml --env-file <arquivo> config --format json`, sempre com o `--env-file` explícito, para o resultado não depender de um `.env` que exista no checkout de quem roda. Nenhum contêiner sobe. O `.env` do slot 1 que os testes usam é o do contrato que a LLD descreve (seção 6, "Ambiente local por slot"): as quatro portas (`WEB_PORT`, `API_PORT`, `STORAGE_PORT`, `MAILPIT_PORT`), os três endereços que a API e o `playwright` leem (`WEB_ORIGIN`, `STORAGE_PUBLIC_URL`, `STORAGE_EMULATOR_HOST`) e a máscara do `.git` (`GIT_MASK_TYPE` e `GIT_MASK_SOURCE`). O `SLOT` também vai no arquivo, mas só informa: o compose não o lê.

"Igual à de hoje" (CA2) é conferido pelos valores que o ambiente tem hoje: as portas publicadas, a linha do emulador de storage, o endereço do healthcheck dele, a máscara em `tmpfs` e a ausência das variáveis do slot na API e no `playwright`. Na implementação, a configuração resolvida sem `.env` também é comparada, uma vez, com a do compose do commit de plano, para a diferença que sobrar ser só o que o ticket acrescenta.

## LUI-184-CA1

**Marca:** teste de unidade

**Cenário:** Dado o `.env` do slot 1 (portas 3010, 3011, 4453 e 8035, os endereços `http://localhost:3010`, `http://localhost:4453` e `http://storage:4453`, e a máscara por arquivo), quando o compose resolve a configuração, então a web publica a 3010 na 3000 do contêiner, a API a 3011 na 3000, o storage a 4453 na 4453 e os e-mails a 8035 na 8025; o emulador de storage inicia com `-port 4453` e `-public-host localhost:4453` e o healthcheck dele confere `127.0.0.1:4453`; a API recebe `WEB_ORIGIN`, `STORAGE_PUBLIC_URL` e `STORAGE_EMULATOR_HOST` do slot, e o `playwright` recebe `STORAGE_PUBLIC_URL`; e os endereços entre contêineres que não são do storage (`http://api:3000`, `http://web:3000`, `http://mailpit:8025`, o banco) seguem como hoje.

**Teste previsto:** testes dos scripts do harness, `scripts/test/dev-env-slot.test.sh`, "o `.env` do slot 1 move as portas e os endereços do ambiente".

## LUI-184-CA2

**Marca:** teste de unidade

**Cenário:** Dado um arquivo de ambiente vazio, quando o compose resolve a configuração, então as portas publicadas são a 3000, a 3001, a 4443 e a 8025, o emulador de storage inicia com `-port 4443` e `-public-host localhost:4443` e o healthcheck dele confere `127.0.0.1:4443`, a máscara do `.git` é `tmpfs` somente leitura, e a API e o `playwright` não recebem nenhuma das variáveis do slot.

**Teste previsto:** testes dos scripts do harness, `scripts/test/dev-env-slot.test.sh`, "sem `.env`, a configuração do ambiente é a de hoje".

## LUI-184-CA3

**Marca:** teste de unidade

**Cenário:** Dado um repositório temporário com o `.git` como pasta e um worktree temporário com o `.git` como arquivo, quando o contêiner sobe com a máscara que a configuração resolvida declara para o contêiner da API (a do `.env` de um worktree para o arquivo, a padrão para a pasta), então o `.git` visto dentro do contêiner fica vazio nos dois casos, sem o histórico, e o contêiner sobe. Como controle, a máscara padrão num `.git` que é arquivo não sobe, que é o defeito que o ticket corrige. O contêiner do teste é o do `postgres`, que o ambiente já baixou, com o mesmo `.:/repo` somente leitura do contêiner da API.

**Teste previsto:** testes dos scripts do harness, `scripts/test/dev-env-slot.test.sh`, "a máscara do `.git` serve para o `.git` que é pasta e para o que é arquivo".

## LUI-184-CA4

**Marca:** revisão humana

**Cenário:** Dado o checkout principal e um worktree no slot 1, com o `.env` feito à mão, quando os dois ambientes sobem, então os dois ficam no ar ao mesmo tempo, as suítes completas dos dois passam, um link de e-mail e uma URL de download do worktree trazem as portas do slot 1 (3010 e 4453), e derrubar um ambiente deixa o outro de pé. A evidência no PR traz os comandos e as saídas: o `docker compose ps` dos dois, o `scripts/verify.sh full` de cada um, o e-mail aberto na tela do slot 1 (porta 8035), a URL de download e o `down` de um com o outro respondendo.

## LUI-184-CA5

**Marca:** revisão humana

**Cenário:** Dado um worktree irmão do checkout principal, quando se roda o `scripts/verify.sh full` nele, então o passo "Segredos nos commits da branch" passa, e ele acusa um segredo de mentira que a pessoa põe num commit do worktree. Dentro do contêiner da API desse worktree, o `.git` está vazio e o histórico do Git não está ao alcance. A evidência no PR traz os dois resultados do passo e a saída do `ls -A` e do `cat` do `/repo/.git` no contêiner.

## LUI-184-CA6

**Marca:** documento

**Cenário:** Dado o diff do PR, quando se leem a LLD (a seção do emulador de storage, a tabela de variáveis e o contrato do `.env` do slot), a tabela de endereços do `AGENTS.md` da raiz, os `AGENTS.md` da web e da API e o README, então cada um descreve os endereços por slot onde citava `localhost` com porta fixa: a tabela da raiz diz que é a do slot 0, e a fórmula (a porta de hoje mais slot × 10) e os nomes das variáveis têm um dono só, a LLD.
