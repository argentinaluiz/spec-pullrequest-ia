---
paths:
  - "apps/api/src/**/*.spec.ts"
  - "apps/api/src/**/*.int-spec.ts"
  - "apps/api/test/**/*.ts"
---

# Testes da API

Os níveis de teste e onde cada regra é provada estão no `apps/api/AGENTS.md`, seção "Testes". Esta regra trata de como escrever o teste.

## Forma de todo teste

- **AAA em três blocos.** Arrange, Act e Assert ficam separados por uma linha em branco, sem comentários marcando cada um. Sem preparação, são dois blocos.
- **Um único Act:** a chamada que o teste prova. Na ponta a ponta, é uma requisição só. Cadastrar, entrar e o que mais o teste precisar antes ficam no Arrange, pelos atalhos de `authRoutes`.
- **Sem asserção no Arrange.** Uma preparação que pode falhar usa um atalho que falha sozinho, como `verificationToken()`.
- **O nome descreve o comportamento observável,** em português e no presente, sem "deve": `responde 201 e envia o e-mail de verificação`, `usa o remetente configurado em MAIL_FROM`.
- **Prove o efeito, e não a chamada.** A asserção confere o resultado: a resposta HTTP, a linha no banco, o e-mail no Mailpit. Um `toHaveBeenCalled` num dublê só vale quando a chamada é o próprio efeito, como um log.
- **Cada teste cria os próprios dados,** com `uniqueEmail()` e os atalhos da base, e não depende da ordem nem do dado de outro teste.

## Por nível

- **Unidade:** a classe é criada com `new`, recebendo os dublês e o objeto de configuração montado no próprio teste. O teste não carrega o `ConfigModule` nem o TestingModule.
- **Dublê só de interface de `src/infra/` ou do `Logger`.** Nada de `vi.mock()` de módulo do projeto nem de SDK de fornecedor.
- **Integração de um artefato do Nest** (service, repository, guard ou provider de um módulo): sempre com `Test.createTestingModule`, importando o módulo real da peça com a configuração (`imports: [AppConfigModule.forRoot(), MailModule]`), sem `overrideProvider`. O módulo é fechado no fim, com `moduleRef.close()`.
- **Integração que não exercita um artefato do Nest,** como a que roda a CLI do Prisma, não usa o `Test.createTestingModule`: ela só usa a dependência real, sem montar módulo nenhum.
- **Ponta a ponta:** sempre com `createTestApp()`, nunca com `NestFactory` nem com o `AppModule` montado à mão. O teste fala com a aplicação só por HTTP, com `supertest`, e a fecha no fim com `app.close()`.

## Base de testes

As suítes de integração e de ponta a ponta usam a base de `test/support/`. Não há dublês de banco nem de e-mail.

- **Banco de testes:** é um banco separado no mesmo PostgreSQL, com o nome do banco de `DATABASE_URL` mais o sufixo `_test`. Ele é criado e migrado sozinho no começo de cada execução da suíte, e todas as tabelas são esvaziadas antes de cada arquivo de teste. Por dividirem esse banco, os arquivos rodam um por vez.
- **Aplicação:** o `createTestApp()` aplica a mesma configuração do `main.ts`, pelo `configureApp()`.
- **Rotas da autenticação:** `authRoutes(app)`, de `test/support/auth-routes.ts`, traz as chamadas de cadastro, verificação, login, renovação, logout, recuperação de senha e `GET /me`, e os atalhos que deixam um Usuário cadastrado ou verificado. O token de um link de e-mail sai de `verificationToken()` e `resetToken()`, que falham se o e-mail não tiver exatamente um link para o caminho esperado.
- **E-mail:** os testes leem o que foi enviado pela API HTTP do Mailpit, com `waitForMailTo()`. Cada teste usa um destinatário próprio, de `uniqueEmail()`, e acha os e-mails por ele. A caixa do Mailpit nunca é apagada, porque ela também serve ao desenvolvimento. Quando o teste provoca mais de um e-mail para o mesmo destinatário (reenvio, redefinição de senha), ele espera o seguinte com `waitForMailTo(endereço, { count: 2 })`. Sem o `count`, a espera termina no primeiro e-mail que já existir. Para provar que um envio **não** aconteceu, o teste provoca em seguida um envio que conhece, espera por ele e confere o total com `countMailTo()`.
- **Prazos:** são testados reduzindo a variável de ambiente no teste, com `vi.stubEnv` antes de `createTestApp()`, sem relógio falso dentro dos services. O valor trocado passa pelo schema: se for inválido, a aplicação do teste não sobe. O Vitest desfaz a troca sozinho no fim de cada teste (`unstubEnvs`), sem `vi.unstubAllEnvs()` à mão.
- **Limite de tentativas:** a base de testes sobe os tetos por e-mail e por IP, porque os testes saem todos do mesmo IP e repetem chamadas com o mesmo e-mail. O teste que exercita um teto o reduz com `vi.stubEnv` antes de `createTestApp()` e esvazia o banco antes de cada caso, com `cleanDatabase()`, para o contador do IP não atravessar os testes.
- **Configuração no teste:** um teste que precisa de um valor de configuração o pega da configuração injetada (`app.get(mailConfig.KEY)`), e não de `process.env`.
- **Rota só de teste:** para provar um comportamento da fundação que nenhuma rota de negócio exercita, o teste declara um controller próprio e o passa em `createTestApp({ controllers })`. Ele não entra na aplicação real.

## Preparar e desfazer com hooks

Os hooks do Vitest (`beforeAll`, `beforeEach`, `afterEach`, `afterAll`) preparam o que os testes precisam antes do Act e desfazem o que essa preparação deixou. A regra de fundo: **quem cria, destrói, no hook de encerramento do mesmo escopo.** O que nasce num `beforeEach` morre num `afterEach`, e o que nasce num `beforeAll` morre num `afterAll`.

**Qual hook usar**

- **`beforeAll` e `afterAll`:** recurso caro que os testes só usam, sem alterar: a aplicação de `createTestApp()`, o `moduleRef` e o `PrismaService` tirado dele. É o formato dos arquivos de hoje.
- **`beforeEach` e `afterEach`:** o que o teste altera ou consome, ou que precisa estar igual no começo de cada caso: um Usuário, uma linha de uma tabela, um dublê, um relógio falso, uma segunda aplicação criada com outra variável de ambiente.
- **Não existe estado que um teste deixa para o próximo.** Se o caso 2 só passa depois do caso 1, a preparação do caso 1 é do `beforeEach`.

**O que vai no hook e o que fica no teste**

- **Preparação de um teste só fica no Arrange dele,** e não num hook: o hook esconde do leitor o que o caso depende. O hook é para a preparação que **vários** casos do mesmo `describe` repetem.
- **O hook guarda o que criou em variáveis do `describe`** (`let user: ...`), atribuídas no `beforeEach`, para o teste e o `afterEach` as lerem. Dado com valor único (e-mail, id) continua saindo de `uniqueEmail()` e `uuidv7()`, e não de uma constante.
- **Sem asserção no hook.** Como no Arrange, a preparação que pode falhar usa um atalho que falha sozinho, e o hook de encerramento não prova nada.
- **Todo hook é `async` e espera o que dispara,** com `await`. Um hook que devolve a promessa solta deixa a limpeza rodar depois do teste seguinte.

**Preparar dados no banco**

- **Na ponta a ponta,** o dado nasce pelas rotas, com os atalhos de `authRoutes` (`registeredUser()` e afins), porque assim o teste usa o caminho real. Gravar direto no banco só vale quando nenhuma rota produz o estado, como um token expirado ou uma linha em estado que a regra impede.
- **Na integração de um repository ou service,** o dado nasce pelo `PrismaService` ou pelo repository do `moduleRef`, com o `id` de `uuidv7()` e o e-mail de `uniqueEmail()`.
- **Apague pelo que você criou:** `deleteMany({ where: { id } })` ou `where: { email }`, nunca uma tabela inteira. A ordem respeita as chaves estrangeiras: o que depende de outra linha sai antes dela, ao contrário da ordem em que foi criado. Quando o schema tem `onDelete: Cascade` (os tokens de e-mail e de renovação saem com o Usuário), apagar a linha de que os outros dependem basta.
- **`cleanDatabase()` não é o desfazer de um hook.** Ela esvazia todas as tabelas, e fica para o teste que precisa de tabela vazia, como o do limite de tentativas. O esvaziamento de cada arquivo já é feito sozinho pela base de testes.
- **O Mailpit nunca é apagado,** nem num hook, como descrito acima.

**Desfazer o que não é banco**

- **Aplicação e módulo criados no hook ou no teste** são fechados no hook de encerramento (`app.close()`, `moduleRef.close()`), mesmo quando o teste falha. Uma aplicação criada dentro do teste, e não no `beforeEach`, é declarada `T | undefined` e fechada com `?.`, para o `afterEach` não cair em cima do erro de quem falhou antes de criá-la.
- **Dublês e relógio falso** voltam no `afterEach`, com `vi.restoreAllMocks()` e `vi.useRealTimers()`. As variáveis trocadas por `vi.stubEnv` voltam sozinhas, como descrito acima.
- **Um hook que cria mais de uma coisa as desfaz na ordem inversa,** e uma falha ao desfazer a primeira não pode impedir as demais: cada passo do encerramento é independente.

```typescript
describe('EmailTokensRepository', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let repository: EmailTokensRepository;
  let userId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule.forRoot(), AuthModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    repository = moduleRef.get(EmailTokensRepository);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    userId = uuidv7();
    await prisma.user.create({
      data: {
        id: userId,
        email: uniqueEmail(),
        passwordHash: 'hash',
        termsAcceptedAt: new Date(),
      },
    });
  });

  afterEach(async () => {
    // Os tokens saem junto, pelo `onDelete: Cascade` do schema.
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it('devolve o id do Usuário e consome o token uma única vez', async () => {
    const tokenHash = uuidv7();
    await repository.replace({
      id: uuidv7(),
      userId,
      type: 'verify_email',
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const first = await repository.use(tokenHash, 'verify_email', new Date());
    const second = await repository.use(tokenHash, 'verify_email', new Date());

    expect(first).toBe(userId);
    expect(second).toBeNull();
  });
});
```

## Onde diverge da skill `nestjs-best-practices`

Nos pontos abaixo, vale esta regra, e não a skill.

- **`test-use-testing-module`** pede o TestingModule também na unidade. Aqui, a unidade usa `new`, e o TestingModule fica para a integração.
- **`test-mock-external-services`** troca o banco e os serviços externos por dublês. Aqui, a integração e a ponta a ponta usam PostgreSQL e Mailpit reais, e a unidade só troca interfaces de `src/infra/`.
- **`test-e2e-supertest`** monta a aplicação no teste e repete a configuração dela. Aqui, a ponta a ponta usa `createTestApp()`, que aplica a configuração do `main.ts`.
- Os exemplos da skill usam Jest (`jest.fn`) e nomes em inglês com "should". Aqui, o executor é o Vitest (`vi.fn`), e os nomes seguem a forma descrita acima.
- **`test-e2e-supertest`** recria o banco inteiro (`synchronize(true)`) no `beforeEach` e cria a aplicação no `beforeEach`. Aqui, a aplicação nasce uma vez por arquivo, no `beforeAll`, e cada teste cria os próprios dados e desfaz só o que criou; o banco é esvaziado por arquivo.
