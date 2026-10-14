<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Comandos

Todos rodam no contêiner `web`, a partir da raiz do repositório:

```bash
docker compose -f compose.dev.yaml exec web <comando>
```

| Comando | O que faz |
| --- | --- |
| `pnpm dev --hostname 0.0.0.0` | Sobe o servidor de desenvolvimento (`http://localhost:3000`) |
| `pnpm lint` | ESLint com as regras do `eslint-config-next` |
| `pnpm exec tsc --noEmit` | Checagem de tipos |
| `pnpm exec next typegen` | Gera os tipos globais das rotas (`PageProps`, `LayoutProps`). O `pnpm dev` e o `pnpm build` já os geram; num clone novo, rode antes do `tsc`. |
| `pnpm build` | Build de produção, em modo `standalone` |

Os comandos dos testes no navegador estão em [Testes no navegador](#testes-no-navegador).

## Particularidades da stack

- **Cache Components ligado:** o `next.config.ts` tem `cacheComponents: true` e `partialPrefetching: true`. Isso muda o modelo de renderização e de cache inteiro (ver [Cache](#cache)).
- **Tipos de rota:** os componentes de rota usam os tipos globais `PageProps<'/rota'>` e `LayoutProps<'/rota'>`, gerados pelo `next typegen`.
- **Classe fora dos tokens falha em silêncio.** As classes de cor, texto, raio e sombra são só as da seção "Tokens no Tailwind" do `docs/design-system.md`. Uma classe como `bg-zinc-50` ou `text-sm` não gera CSS nenhum, e o build não avisa.
- **Ícones:** o `LucideProvider` do layout raiz já aplica o traço do design system, e o Lucide esconde do leitor de tela o ícone sem rótulo. O componente passa só o tamanho e a cor.
- **Lint sem formatador:** o projeto não tem Prettier. O `pnpm lint` é a única checagem de estilo.

## Server Components primeiro

Todo componente nasce como Server Component. O `"use client"` precisa de um motivo: estado ou efeito, manipulador de evento, API do navegador ou hook que só existe no cliente. Buscar dados, ler cookies, formatar valores e montar layout não são motivo.

**Como manter a fronteira pequena**

- **Empurre o `"use client"` para a folha.** O componente de cliente é o botão, o menu ou o campo, e não a página, a lista ou o layout em volta dele. Tudo o que um arquivo com `"use client"` importa vai para o pacote do navegador.
- **Componha por `children`.** Um componente de cliente que envolve conteúdo (diálogo, menu, painel recolhível) recebe esse conteúdo como `children` ou como prop, já renderizado no servidor. Ele não importa o conteúdo.
- **Dados descem por props.** O Server Component busca os dados e passa ao componente de cliente só o que ele mostra. As props atravessam a rede, e não podem levar token, objeto inteiro da API nem campo que a tela não usa.
- **Mutação é Server Action.** O componente de cliente não chama a API. Ele dispara uma Server Action.
- **Estado na URL antes de estado no cliente.** Filtro, ordenação, pasta atual e termo de busca ficam em `params` e `searchParams`, lidos no servidor. Só vira `useState` o que é efêmero, como menu aberto ou item em foco.
- **Código só de servidor é marcado com `import 'server-only'`,** para que um import acidental num componente de cliente quebre o build em vez de vazar código ou segredo. Quais módulos levam a marca está em [Acesso a dados](#acesso-a-dados).

A exceção conhecida é o upload: o navegador envia os chunks direto ao Cloud Storage, e por isso o controle do envio (progresso, pausa e retomada) é de cliente. A sessão de upload continua sendo criada e concluída por Server Action.

## Acesso a dados

A estrutura de pastas, o contrato da API e as variáveis de ambiente estão no `docs/lld.md`, nas seções 1, 3 e 6. O mapa de rotas e telas, os cookies de token e a Sessão, o upload no navegador, a entrega de arquivos e a reação aos erros da API estão na seção 7. Leia a do assunto antes de implementar.

- **A API é chamada só no servidor.** Server Components, Server Actions e Route Handlers usam o cliente de `lib/api`. Não existe `fetch` para a API em componente de cliente nem variável `NEXT_PUBLIC_` com o endereço dela.
- **O cliente de `lib/api` repassa o IP do navegador.** Toda chamada leva o IP e o segredo `INTERNAL_API_SECRET`, que a API exige para aceitá-lo (seção 1 do `docs/lld.md`). Por ler os cabeçalhos da requisição, o cliente só roda onde há uma requisição em curso, e nunca na pré-renderização.
- **Toda leitura protegida passa por `lib/dal`.** É ela que confere a Sessão na API. O Proxy só faz um filtro otimista e nunca substitui essa conferência.
- **Toda Server Action confere a Sessão de novo.** Uma Server Action é um endpoint público. Esconder o botão na interface não protege nada. A exceção é a de sair, que tem de funcionar com a Sessão já expirada e só age sobre os cookies de quem a chamou.
- **Página protegida:** lê o Usuário com `getCurrentUser()`, de `lib/dal/user.ts`, dentro de `<Suspense>`. Sem Sessão, a função já leva à tela de entrar.
- **O Proxy fala com a API por `lib/session/renewal.ts`.** É a única chamada à API fora de `lib/api`, porque o Proxy não pode importar o cliente de lá. Ela só renova a Sessão. O endereço e o prazo da API vêm de `lib/api/endpoint.ts`.
- **Quem leva `server-only`:** os módulos de `lib/api`, menos o `endpoint.ts`, os de `lib/dal` e o `lib/session/tokens.ts`, que lê e grava em `cookies()`. O `endpoint.ts` e os outros arquivos de `lib/session` (caminhos, destino de retorno, leitura da expiração e gravação dos cookies num armazenamento recebido) não guardam segredo e servem também ao Proxy, por isso não levam.
- **O Proxy não redireciona Server Action.** Com ou sem Sessão, a ação segue e confere a Sessão ela mesma. Um redirecionamento ali vira tela de erro no navegador. O Proxy só renova a Sessão antes dela, se der.
- **O endereço da tela de entrar sai de `loginPath()`,** de `lib/session/login-path.ts`, que também é dono dos avisos que ela mostra. Ninguém escreve `/entrar?aviso=...` à mão.
- **Rota nova nasce protegida.** O `proxy.ts` tem a lista das telas de autenticação e a das rotas públicas. Uma rota que abre sem Sessão precisa entrar numa das duas.
- **Uma busca por requisição.** Funções de leitura usadas por mais de um componente na mesma página são envolvidas em `React.cache`, que evita a chamada repetida dentro da mesma requisição. Isso não é cache entre requisições e não tem custo de invalidação.

## Formulários e textos

- **Formulários:** Server Actions com `useActionState`. A validação é feita com zod na Server Action, e o resultado volta como estado do formulário. A validação no navegador é só conforto.
- **Onde ficam:** o formulário é um componente de cliente ao lado da página que o usa (`app/(auth)/criar-conta/register-form.tsx`). As Server Actions de um grupo de rotas ficam num `actions.ts` na pasta do grupo, e o estado que elas devolvem, num `form-state.ts` ao lado. Um formulário que mais de uma tela do grupo usa fica na pasta do grupo e recebe a Server Action por prop (`app/(auth)/request-link-form.tsx`).
- **O que vem da URL entra no formulário por props.** O aviso de outro fluxo e o campo oculto do destino são Server Components dentro de `<Suspense>`, passados ao formulário como props. Um formulário inteiro dentro de `<Suspense>` seria trocado quando a URL fosse lida, e a pessoa perderia o que já digitou.
- **Valor da URL sem o qual o envio não vale:** o formulário só é renderizado depois de o valor ser lido, dentro de um `<Suspense>` sem fallback, e o recebe como prop. É o caso do token da tela de nova senha. Um campo oculto que chega depois dos outros pode ficar de fora de um envio rápido, o que só é aceitável para um valor opcional, como o destino de retorno.
- **Erro junto ao campo:** o formulário leva `noValidate`, para o erro aparecer no campo, com o texto da web, e não no balão do navegador. A senha nunca volta no estado do formulário.
- **Erros da API:** a API responde com um `code` estável. O cliente de `lib/api` devolve o erro esperado como valor (`{ ok: false, error }`), e não como exceção. A web traduz o `code` em mensagem num único mapa, o de `lib/api/error-messages.ts`, e nenhum componente mostra a mensagem crua da API.

## Componentes e vitrine

- **Estados por classe, e não por prop.** Hover, foco, pressionado e desabilitado saem das variantes do Tailwind e dos utilitários de estado da seção "Tokens no Tailwind" do `docs/design-system.md`. Um componente só recebe prop para o estado que o CSS não enxerga, como `loading` e `error`.
- **Link ou botão pelo `href`.** `button-primary` e `text-link` viram um `Link` do Next.js quando recebem `href`, e um `<button>` quando não recebem. O `button-primary` mantém o `type` nativo e envia o formulário em que está; o `text-link` sem `href` é `type="button"`.
- **A vitrine** (`app/vitrine/`) mostra os componentes fora de qualquer fluxo: `/vitrine` traz os primitivos em cada estado, `/vitrine/auth-card` traz o cartão de autenticação montado, `/vitrine/drive` traz as peças do Drive (casca, lista com "Carregar mais" e estado vazio), e `/vitrine/api` chama a API pelo cliente de `lib/api`. Ela serve à validação visual e aos testes no navegador, e só existe no servidor de desenvolvimento: no build de produção, as rotas dela respondem 404. Ao criar um componente ou um estado, acrescente-o à vitrine.

## Cache

Com Cache Components, **nada é guardado em cache por padrão**: uma leitura roda a cada requisição, a menos que alguém a marque com `"use cache"`. Neste projeto, a resposta padrão é não criar cache. Antes de mexer nisso, leia `01-app/01-getting-started/08-caching.md` e `09-revalidating.md`, na documentação do Next.js.

Por que não criar:

- **Quase tudo é dado privado de um Usuário.** Um cache mal chaveado mostra os arquivos de uma pessoa para outra.
- **O Usuário espera ver o que acabou de fazer.** Cada cache vira uma invalidação obrigatória em toda mutação que toca aquele dado.
- **A web roda em várias instâncias no Cloud Run.** O `"use cache"` fica na memória de cada uma, e a invalidação por tag só vale na instância que a recebeu.
- **Permissão não pode envelhecer.** Um link revogado tem de parar de funcionar na hora.

O caminho padrão para dado dinâmico é **streaming**: o componente que lê o dado fica dentro de `<Suspense>`, com um esqueleto como fallback, e a casca da página é pré-renderizada.

Se um cache for mesmo necessário:

- **Só para dado público e igual para todos,** como a lista de planos e preços. O `"use cache: remote"` está fora, porque exige um cache handler que o projeto não tem.
- **Sempre com `cacheLife` e `cacheTag`,** com as tags como constantes de um único módulo, usado por quem cria e por quem invalida. Como a invalidação não atravessa instâncias, o `cacheLife` é o prazo real de renovação.
- **Nunca dado pessoal na chave.** Os argumentos e as tags são gravados em texto puro.

### Erros de pré-renderização

O overlay de desenvolvimento e o build acusam quando um componente lê dado sem cache ou uma API de requisição (`cookies()`, `headers()`, `params`, `searchParams`) fora de `<Suspense>`. Só os dois acusam: o lint e o `tsc` não pegam esses erros. A correção é quase sempre envolver esse componente em `<Suspense>`, o mais perto possível de quem lê o dado, para a casca ficar grande.

- **Não resolva com `"use cache"`.** Colocar cache para calar o erro cria um cache que ninguém decidiu ter.
- **Valores não determinísticos:** `Date.now()`, `Math.random()` e `crypto.randomUUID()` durante a renderização também são barrados. Chame `await connection()` antes, dentro de `<Suspense>`.

## Testes no navegador

Rodam no contêiner `playwright`, e não no `web`, a partir da raiz do repositório:

```bash
docker compose -f compose.dev.yaml exec playwright <comando>
```

| Comando | O que faz |
| --- | --- |
| `npx playwright test` | Todos os testes de `e2e/` |
| `npx playwright test e2e/smoke.spec.ts` | Um arquivo de teste só |
| `npx playwright test -g "nome do teste"` | Um teste pelo nome |

- **A web e a API têm de estar no ar.** Os testes falam com a aplicação real em `http://web:3000`. Como subir as duas está no `AGENTS.md` da raiz, seção "Execução no Docker".
- **O relatório** fica em `apps/web/playwright-report/`, e o trace de um teste que falhou, em `apps/web/test-results/`. Os dois ficam fora do Git.
- **A versão do Playwright é fixa.** A do `@playwright/test`, no `package.json`, e a da imagem do serviço `playwright`, no `compose.dev.yaml`, têm de ser a mesma. Atualize as duas juntas.

**Como escrever**

- **O que entra:** o que só existe na web, pela porta que o Usuário usa. As regras do contrato são provadas pelos testes de ponta a ponta da API, e não aqui.
- **Sem outro nível de teste:** a web não tem executor de testes de unidade. Enquanto for assim, o cliente de `lib/api` é provado pela rota `/vitrine/api`, e os auxiliares de `e2e/support/`, por um teste próprio na mesma suíte.
- **Onde ficam:** em `e2e/`, com o sufixo `.spec.ts`. Os auxiliares ficam em `e2e/support/`.
- **Usuários de teste:** `e2e/support/account.ts` cadastra, verifica e entra pela própria interface (`createVerifiedUser()`, `signIn()`), e sai pelo menu da conta (`signOut()`). Quem está na casca do Drive é conferido pelo botão do menu da conta, que leva o e-mail no nome (`expectSignedInAs()`). Os cookies de token da Sessão são lidos e plantados com `e2e/support/session.ts`.
- **Itens na Pasta raiz:** até o upload existir, nenhuma tela cria um Item. `seedRootFiles()`, de `e2e/support/items.ts`, grava arquivos ativos direto no banco da API, pela `DATABASE_URL` do serviço `playwright`. O Usuário já tem de ter entrado, porque a raiz nasce na primeira listagem; depois de gravar, recarregue a página.
- **Token de acesso expirado:** o teste não espera os 15 minutos. Ele apaga o cookie do token de acesso, que é o que o navegador faz quando o token expira, e deixa o de renovação.
- **E-mails:** `e2e/support/mailpit.ts` lê os e-mails pelo Mailpit. `uniqueEmail()` cria um destinatário que nenhum outro teste usa, `waitForMailTo()` espera o e-mail chegar e `extractLink()` tira dele o link de um caminho. Nenhum teste apaga a caixa do Mailpit, que também serve ao desenvolvimento.
- **Seletores:** pelo papel e pelo nome acessível (`getByRole`, `getByLabel`), que é como o Usuário acha o elemento. `data-testid` fica para o que não tem papel nem rótulo.
- **Depois de navegar por um link, prefira `getByRole`.** O Next.js mantém a tela anterior escondida na página, e `getByLabel` acha também os campos dela. `getByRole` ignora o que está escondido.
