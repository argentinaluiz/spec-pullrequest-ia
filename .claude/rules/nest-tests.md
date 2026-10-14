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
- **Integração:** sempre com `Test.createTestingModule`, importando o módulo real da peça com a configuração (`imports: [AppConfigModule.forRoot(), MailModule]`), sem `overrideProvider`. O módulo é fechado no fim, com `moduleRef.close()`.
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

## Onde diverge da skill `nestjs-best-practices`

Nos pontos abaixo, vale esta regra, e não a skill.

- **`test-use-testing-module`** pede o TestingModule também na unidade. Aqui, a unidade usa `new`, e o TestingModule fica para a integração.
- **`test-mock-external-services`** troca o banco e os serviços externos por dublês. Aqui, a integração e a ponta a ponta usam PostgreSQL e Mailpit reais, e a unidade só troca interfaces de `src/infra/`.
- **`test-e2e-supertest`** monta a aplicação no teste e repete a configuração dela. Aqui, a ponta a ponta usa `createTestApp()`, que aplica a configuração do `main.ts`.
- Os exemplos da skill usam Jest (`jest.fn`) e nomes em inglês com "should". Aqui, o executor é o Vitest (`vi.fn`), e os nomes seguem a forma descrita acima.
