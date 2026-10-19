# Da spec ao pull request com IA

Projeto da [Full Cycle](https://fullcycle.com.br) que mostra, na prática, como construir um software com agentes de código: da ideia à especificação, da especificação aos tickets e dos tickets ao pull request.

A aplicação usada como exemplo é um **gerenciador de arquivos na nuvem**, no estilo Google Drive, com API em NestJS, frontend em Next.js e banco PostgreSQL. O foco do repositório, porém, não é o produto: é o **processo**. Os documentos, as regras para os agentes, as skills e as conversas que geraram cada parte do código estão todos aqui.

## Estado atual

O brief define nove funcionalidades para o MVP. A **Funcionalidade 01, cadastro e login com e-mail e senha**, já está desenvolvida: cadastro com verificação de e-mail, entrar e sair, renovação de sessão, recuperação de senha e limite de tentativas. A **Funcionalidade 02, upload e download de arquivos**, já está especificada e quebrada em tickets, mas ainda não foi implementada. As outras sete ainda não têm spec. A lista completa está em [`docs/product-brief.md`](./docs/product-brief.md).

## Autor

<a href="https://github.com/argentinaluiz">
    <img src="https://avatars.githubusercontent.com/u/4926329?v=4&s=100" width="100px;" alt=""/>
    <br />
    <sub>
        <b>Luiz Carlos</b>
    </sub>
</a>

---

## O que tem no repositório

| Caminho | O que é |
|---|---|
| [`docs/`](./docs) | Os documentos que definem o produto: brief, arquitetura de alto e de baixo nível e design system. |
| [`docs/specs/`](./docs/specs/README.md) | Cópia das specs e dos tickets do Linear, só para conferência. |
| [`docs/sessoes/`](./docs/sessoes/README.md) | As conversas com o agente de código, na íntegra. |
| [`docs/Gerenciador de arquivos.fig`](./docs/Gerenciador%20de%20arquivos.fig) | O arquivo do Figma com o design das telas. |
| [`AGENTS.md`](./AGENTS.md) | As regras que os agentes seguem em todo o projeto. |
| [`GLOSSARY.md`](./GLOSSARY.md) | O vocabulário do domínio, usado nas specs e nos tickets. |
| [`apps/api`](./apps/api) | A API em NestJS. |
| [`apps/web`](./apps/web) | O frontend em Next.js. |
| [`.claude/skills`](./.claude/skills) | As skills usadas para especificar, quebrar em tickets e implementar. |

## Sessões

A pasta [`docs/sessoes/`](./docs/sessoes/README.md) guarda as transcrições das sessões do Claude Code que construíram o projeto, em ordem cronológica. Cada arquivo traz as mensagens, as respostas do agente, as chamadas de ferramenta com seus resultados e o trabalho dos subagentes.

Comece pelo [índice](./docs/sessoes/README.md), que lista as sessões com data, hora e título. Elas seguem a ordem em que o projeto nasceu: documentação, criação dos projetos, design system e, depois, um ticket por sessão.

## Ferramentas do processo

O agente trabalha ligado a duas ferramentas externas por **MCP** (Model Context Protocol), sem copiar e colar entre elas.

### Figma, para o design system

O Figma é a ferramenta de design do projeto, acessada pelo servidor MCP do plugin `figma`. O design system nasce nele e é espelhado no código: o agente lê os tokens e os componentes no Figma para implementar as telas e escreve de volta quando o design muda.

- [`docs/design-system.md`](./docs/design-system.md) define os tokens, os componentes e o fluxo de trabalho entre o Figma e o código.
- [`docs/Gerenciador de arquivos.fig`](./docs/Gerenciador%20de%20arquivos.fig) é o arquivo do Figma com o design das telas. Para abrir, importe-o no [Figma](https://www.figma.com): na tela inicial, use **Import** e selecione o `.fig`.

### Linear, como gerenciador de issues

As specs e os tickets vivem no Linear, e não em arquivos do repositório. O agente acessa o Linear pelo servidor MCP `linear-server`, configurado no [`.mcp.json`](./.mcp.json): cria a spec de uma funcionalidade, quebra em tickets com as dependências entre eles, pega o próximo ticket liberado e atualiza o andamento.

O caminho da funcionalidade ao ticket e as regras de escrita estão na seção "Issues e tickets no Linear" do [`AGENTS.md`](./AGENTS.md).

#### A cópia local das specs

A pasta [`docs/specs/`](./docs/specs/README.md) traz as specs e os tickets das duas primeiras funcionalidades, copiados do Linear, com a situação e as dependências de cada um.

**Ela existe só para conferência.** Tudo é gerenciado no Linear: é lá que specs e tickets são escritos, alterados e concluídos. A cópia é um retrato tirado em 12/10/2026, para quem lê o repositório sem acesso ao Linear, e não acompanha as mudanças feitas depois. Os agentes de código não a usam; eles leem as issues direto no Linear.

## Como rodar

O único pré-requisito é o **Docker**. Tudo roda dentro dos contêineres do Docker Compose.

```bash
# sobe o ambiente (na primeira vez, leva alguns minutos)
docker compose -f compose.dev.yaml up -d --build --wait

# em terminais separados
docker compose -f compose.dev.yaml exec web pnpm dev --hostname 0.0.0.0
docker compose -f compose.dev.yaml exec api pnpm start:dev
```

| Serviço | Endereço |
|---|---|
| Web | <http://localhost:3000> |
| API | <http://localhost:3001/v1> |
| E-mails capturados | <http://localhost:8025> |

São os endereços do slot 0, o de um checkout sem `.env` na raiz. Vários checkouts ao mesmo tempo usam um slot cada um, com portas próprias: o contrato do `.env` está no [`docs/lld.md`](./docs/lld.md), seção 6, "Ambiente local por slot".

Os detalhes do ambiente e os demais comandos estão no [`AGENTS.md`](./AGENTS.md).
