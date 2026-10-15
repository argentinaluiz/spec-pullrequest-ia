## Comandos

Todos rodam no contêiner `api`, a partir da raiz do repositório:

```bash
docker compose -f compose.dev.yaml exec api <comando>
```

| Comando | O que faz |
| --- | --- |
| `pnpm start:dev` | Sobe a API em modo watch (`http://localhost:3001` na máquina) |
| `pnpm test` | Suíte de unidade (`*.spec.ts`) |
| `pnpm test:int` | Suíte de integração (`*.int-spec.ts`) |
| `pnpm test:e2e` | Suíte de ponta a ponta (`*.e2e-spec.ts`) |
| `pnpm test:e2e test/problem-details.e2e-spec.ts` | Um arquivo de teste só. Vale para as três suítes. |
| `pnpm test:e2e -t "nome do teste"` | Um teste pelo nome. Vale para as três suítes. |
| `pnpm test:cov` | Testes unitários com cobertura |
| `pnpm lint` | oxlint com regras que usam tipos |
| `pnpm format` | Prettier em `src/` e `test/` |
| `pnpm exec tsc --noEmit` | Checagem de tipos |
| `pnpm build` | Compila para `dist/` |
| `pnpm exec prisma migrate dev --name <nome>` | Cria uma migração a partir do `prisma/schema.prisma` e a aplica no banco local. Não gera o cliente. |
| `pnpm exec prisma generate` | Gera de novo o cliente do Prisma, depois de mudar o schema |
| `pnpm uploads:cleanup-pending` | Remove os uploads `pending` vencidos, devolvendo o espaço à Cota, e termina os que um expurgo anterior deixou `deleting` (docs/lld.md, seções 4.6 e 5). Compila e abre a aplicação sem o servidor HTTP, imprime `Uploads pendentes removidos: <n>. Falhas: <m>.` e sai com 1 se alguma falhou, ou com 0. O prazo é o `PENDING_UPLOAD_TTL_HOURS`, com o padrão e a regra da tabela de variáveis do LLD (seção 6). Compilado por `tsconfig.uploads-cleanup.json`, que tem o próprio `outDir`. |
| `pnpm setup:dev` | Prepara o ambiente: `.env`, chaves do JWT, cliente do Prisma e migrações. Já roda sozinho quando o contêiner sobe. |

**Cada suíte tem o próprio comando e a própria configuração do Vitest.** O `pnpm test` roda só a de unidade. Para rodar as três, use `pnpm test`, `pnpm test:int` e `pnpm test:e2e`. O `scripts/verify.sh full api` roda as três de uma vez.

Uma suíte que não roda nenhum teste falha. As de integração e de ponta a ponta precisam do `postgres` e do `mailpit` no ar, o que o Compose já garante.

O `pnpm lint` só aponta os problemas, sem corrigir. A formatação é conferida à parte, pelo `pnpm format`.

## Particularidades da stack

- **Módulos ES:** o projeto é `"type": "module"` com `moduleResolution: nodenext`. Todo import relativo leva a extensão `.js`, mesmo apontando para um arquivo `.ts` (`import { AppService } from './app.service.js'`). Sem a extensão, o `tsc` e o Node falham.
- **Prisma:** a versão é a 7, fixada no `package.json` (o motivo está na seção 1 do LLD). O cliente é gerado em `src/generated/prisma/`, que fica fora do Git, do lint e do Prettier, e é importado de `generated/prisma/client.js`. A URL do banco não fica no schema: a CLI a lê no `prisma.config.ts`, com o `env('DATABASE_URL')` do Prisma e o `.env` carregado pelo `dotenv`. Sem a variável, qualquer comando da CLI falha apontando-a, até o `prisma generate`, e por isso o `Dockerfile` passa uma URL de reserva só a esse comando. Depois de mudar o `schema.prisma`, crie a migração com `prisma migrate dev` e gere o cliente com `prisma generate`: no Prisma 7, a migração não gera mais o cliente.
- **Cliente do banco:** o `PrismaService` recebe a URL pela configuração injetada, que a valida na subida, e não lê `process.env.DATABASE_URL` direto, como no exemplo da skill `prisma-client-api`. A divergência é de propósito.
- **pnpm:** os pacotes que rodam script na instalação precisam estar liberados no `pnpm-workspace.yaml` (`allowBuilds`). Sem isso, a instalação falha.

## Testes

O arquivo de teste leva o nome do arquivo testado, como descrito em `.claude/rules/nest-coding-standards.md`. O sufixo define o nível do teste e a suíte que o executa:

| Nível | Sufixo | Onde fica | O que exercita |
| --- | --- | --- | --- |
| Unidade | `.spec.ts` | Ao lado do código, em `src/` | Uma classe isolada, criada com `new`, com as dependências trocadas por dublês |
| Integração | `.int-spec.ts` | Ao lado do código, em `src/` | Uma peça com a dependência real, como um repository contra o PostgreSQL. Um artefato de um módulo do Nest é montado com `Test.createTestingModule` |
| Ponta a ponta | `.e2e-spec.ts` | Em `test/` | A aplicação inteira por HTTP, com `createTestApp()` e `supertest` |

**Onde cada regra é provada:** as regras de negócio são provadas pelos testes de ponta a ponta, pelas rotas, com banco e e-mail reais. O teste de unidade de um service é opcional, e vale quando a regra tem muitos casos que seriam lentos ou repetitivos pelas rotas. Funções puras têm teste de unidade. A spec da funcionalidade pode restringir isso, e ela prevalece.

Como escrever o teste (AAA, dublês, base de `test/support/`) está em `.claude/rules/nest-testing.md`.

## Aplicação HTTP

- **Prefixo:** o `/v1` é aplicado a todas as rotas por `configureApp()`, em `src/app.setup.ts`, que o `main.ts` e a base de testes chamam. Os controllers declaram a rota sem o prefixo.
- **Configuração global:** o que vale para todas as rotas e não depende de injeção entra em `configureApp()`. O filtro de erros e a validação de entrada são registrados no `AppModule` (`APP_FILTER` e `APP_PIPE`), e não no `main.ts`, para valerem também nos testes.
- **Rota protegida:** o controller leva `@UseGuards(AuthGuard)` e lê o id do Usuário com `@CurrentUserId()`, os dois de `src/common/auth/`. O módulo dele importa o `AccessTokensModule`. O guard só confere a assinatura do token, sem consultar o banco.
- **IP de quem chama:** o controller leva `@UseGuards(ClientIpGuard)` e lê o IP com `@ClientIp()`, os dois de `src/common/client-ip/`. Ninguém lê o IP da requisição por conta própria: é o guard que decide entre o IP repassado pela web e o da conexão.
- **Limite de tentativas:** o service do módulo dono da regra monta as chaves e chama o `RateLimitService`, de `src/common/rate-limit/`, antes de qualquer outra coisa. O módulo dele importa o `RateLimitModule`.

### Contrato OpenAPI

O contrato das rotas é o `openapi.json`, gerado do código pelo `@nestjs/swagger` e conferido pela verificação (`docs/harness.md`, etapa 8). O plugin do Nest (`nest-cli.json`) lê os DTOs, então eles não levam decorators do Swagger.

- **Rota nova ou alterada:** o controller leva `@ApiTags`, o tipo de sucesso (`@ApiOkResponse({ type })` ou o tipo de retorno) e um `@ApiProblem(status, ...códigos)`, de `src/common/openapi/`, para cada erro que a rota pode devolver. A resposta é uma classe, e não uma `interface`, porque o plugin só lê classes.
- **Rota protegida:** acrescente `@ApiBearerAuth()` ao controller.
- **Cabeçalho de entrada:** o plugin não enxerga um cabeçalho lido com `@Headers()` ou do `Request`. Declare-o no método com `@ApiHeader({ name: 'Idempotency-Key', required: true })`, para ele entrar no snapshot como parâmetro `in: header`. O `Authorization` não é declarado: o `@ApiBearerAuth()` já o descreve.
- **Cabeçalho de resposta:** declare-o no decorator da resposta que o devolve, na opção `headers`, como `@ApiCreatedResponse({ type: ItemDto, headers: { Location: { required: true, schema: { type: 'string' } } } })`. O `@ApiProblem` ainda não aceita cabeçalhos: o primeiro erro que devolver um, como o `Retry-After` do `rate_limited`, acrescenta a opção a ele.
- **Regenerar o snapshot:** `pnpm openapi:generate openapi.json`, no contêiner `api`, e faça o commit do arquivo. A verificação reprova se o snapshot divergir do código.
- **Schema do banco:** o `prisma/schema.prisma` é o dono das tabelas implementadas, com as observações nos comentários `///`. Mudou o schema, crie a migração: a verificação reprova schema sem migração.

## Práticas de código

A estrutura de pastas, o esquema do banco, o contrato da API, os estados e as regras de negócio, as tarefas do worker e os limites, prazos e variáveis de ambiente estão no `docs/lld.md`, nas seções 1 a 6. Leia a do assunto antes de implementar, e as convenções das seções 2 e 3.1 antes de criar uma tabela ou uma rota.

O código segue Clean Architecture e SOLID. A regra central é a direção das dependências: o controller conhece o service, e o service não conhece nem o HTTP nem o fornecedor de nenhuma integração.

As convenções de cada artefato estão em `.claude/rules/nest-*.md`, e cada uma vale para os arquivos listados no `paths` dela. O Claude Code as carrega sozinho quando mexe num desses arquivos. Outro agente lê a do artefato antes de mexer nele.

### Componentes e como se comunicam

Os tipos de peça, o que cada um pode chamar e a direção das dependências estão no `docs/lld.md`, seção 1.1. Leia-a antes de criar uma peça nova ou de injetar uma dependência. A tabela "Pode importar" mais abaixo é a conferência de cada import num arquivo de service.

**Onde diverge da skill `nestjs-best-practices`:** a `arch-use-events` troca a chamada direta entre services por eventos (`@nestjs/event-emitter`). Aqui, o service chama o outro de forma direta: os fluxos são síncronos, a resposta e a transação dependem do resultado, e a sequência faz parte da regra de negócio. A `arch-single-responsibility` mostra o controller orquestrando vários services, o que também não vale aqui (`.claude/rules/nest-controller.md`).

### Transação e atomicidade

O que cada peça é está no LLD (seção 1.1). Aqui, como o service e o repository dividem a transação:

- **Service:** quando uma operação grava por mais de um repository e as gravações têm de valer juntas, é o service que abre a transação, com o `$transaction` do `PrismaService`, e passa o cliente dela, o `tx`, aos repositories do próprio módulo.
- **Repository:** quando um comando lê, decide e grava, ou quando duas gravações dele têm de valer juntas, o repository as põe numa transação e devolve ao service o que aconteceu, como um resultado tipado (`'rotated' | 'invalid' | 'reused'`). O que só pode valer junto com a gravação entra nessa mesma transação, mesmo sendo consequência de uma regra. A regra continua descrita e conferida no service. O método que um service precisa chamar dentro de uma transação aceita, como último parâmetro, o cliente dela (`db: Prisma.TransactionClient = this.prisma`), e o parâmetro entra quando o primeiro service precisa dele. Não o aceitam o método que abre a própria transação nem o que depende de capturar um erro do banco, porque no PostgreSQL esse erro aborta a transação aberta.

### A camada de serviços não conhece o mundo externo

Um service recebe e devolve dados simples e tipos do domínio. Ele tem de poder ser chamado de um controller, de uma tarefa do worker ou de um teste unitário sem nenhuma adaptação.

Antes de adicionar um import num arquivo de service, confira em qual dos dois grupos ele cai:

| Pode importar | Não pode importar |
| --- | --- |
| `Injectable`, `Inject` e `Logger` do `@nestjs/common` | `HttpException` e as filhas (`NotFoundException`, `BadRequestException` etc.) e `HttpStatus` |
| Entidades, tipos e erros de domínio do próprio módulo | `Request` e `Response` do Express, e os decorators de rota (`@Req`, `@Body`, `@Headers`) |
| O repository e os outros services do próprio módulo | DTOs do controller, com decorators do class-validator ou do Swagger |
| O service público de outro módulo, e os services de `src/common/` | Repository, tabelas ou tipos internos de outro módulo |
| As interfaces de `src/infra/` (storage, fila, e-mail, gateway), pelo token | A implementação delas e os SDKs de fornecedor (`@google-cloud/*`, cliente SMTP, SDK do gateway) |
| O `PrismaService` e o tipo `Prisma.TransactionClient`, só para abrir uma transação e passar o `tx` | Consultas e gravações pelo cliente do banco |
| Utilitários puros, sem entrada e saída | `process.env`, direto. A configuração chega pelo módulo de config, por injeção. |

O que vem da requisição (corpo, parâmetros, usuário autenticado, IP, cabeçalho `Idempotency-Key`) é extraído no controller ou num guard e entra no service como argumento tipado.

A mesma regra vale para o repository: ele não importa nada de HTTP.

### Erros

O service lança erro de domínio, e só o exception filter global conhece o HTTP: ele traduz o erro em status e corpo `application/problem+json`. As regras estão em `.claude/rules/nest-errors.md` e, para o controller, em `.claude/rules/nest-controller.md`.

## Configuração

Toda configuração entra no projeto por um módulo de config próprio, em `src/config/`, feito com `@nestjs/config` e validado com Joi.

- **Validação na subida:** um schema do Joi (`env.schema.ts`) descreve todas as variáveis de ambiente, com tipo, obrigatoriedade e valor padrão. A função `validatedEnv()` (`env.ts`) aplica esse schema, e é ela que o `ConfigModule.forRoot` recebe em `validate` e que as configurações por assunto chamam. Se uma variável faltar ou vier inválida, a aplicação não sobe e o erro diz qual é.
- **Segredos na mensagem de erro:** a mensagem de validação vai para o log. Numa variável secreta, a regra do schema não pode usar uma mensagem do Joi que repita o valor recusado, como a de `pattern`. Use um `.custom()` com mensagem fixa, como fazem as chaves do JWT.
- **Leitura do valor validado:** as configurações por assunto leem de `validatedEnv()`, que devolve as variáveis já convertidas e com os padrões aplicados pelo schema. Nenhuma delas converte valor nem repete um padrão, e nenhuma lê `process.env`. A validação roda de novo a cada leitura, então um valor trocado depois da subida do módulo, como num teste, também passa pelo schema.
- **Único ponto de leitura:** fora de `src/config/`, ninguém lê `process.env`. Services, guards e implementações de `src/infra/` recebem a configuração por injeção.
- **Tipagem:** os valores saem do módulo já convertidos e tipados (número, booleano, duração), e não como `string | undefined`. Prefira configurações agrupadas por assunto, com `registerAs` (`auth`, `storage`, `mail`), a chaves soltas lidas por nome. Cada assunto tem o próprio arquivo (`mail.config.ts`) e é injetado pela chave dele: `@Inject(mailConfig.KEY) config: ConfigType<typeof mailConfig>`.
- **Variável nova:** entra na mesma tarefa no schema do Joi, no `.env.example` e na tabela da seção 6 do LLD.
- **Padrões:** os valores padrão do schema são os de produção. O ambiente local os reduz pelo `.env`.
- **Exceções à leitura de `process.env`:** a base de testes, que carrega o `.env` e troca `DATABASE_URL` pelo banco de testes, e o `prisma.config.ts` são os únicos que leem `process.env` fora de `src/config/`. A CLI do Prisma roda fora do Nest, então lê o `.env` e a `DATABASE_URL` por conta própria.
- **Arquivo `.env`:** a aplicação lê o `.env` da pasta do projeto, se ele existir, e as variáveis já definidas no ambiente prevalecem sobre as do arquivo. Em produção não há arquivo.
