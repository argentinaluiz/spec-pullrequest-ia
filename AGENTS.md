# AGENTS.md

## Documentos

Em `docs/` estão os documentos que definem o produto, a arquitetura e os detalhes de implementação. Abaixo estão os principais do projeto:

1. `docs/product-brief.md`: o quê e para quem. Escopo do MVP, o que fica fora, planos e métricas.
2. `docs/hld.md`: High-level design, documento de arquitetura de alto nível. Aqui ficam as decisões de arquitetura, os fluxos principais e a visão geral do sistema.
3. `docs/lld.md`: Low-level design, documento de arquitetura de baixo nível. Aqui ficam a estrutura de pastas, as bibliotecas escolhidas, os esquemas de banco, os contratos de API, os estados, as regras de cota, as tarefas do worker, o upload em chunks e as variáveis de ambiente, os componentes da API e como se comunicam, e o comportamento da web: o mapa de rotas e telas, a Sessão no navegador, a entrega de arquivos e a reação aos erros da API.
4. `docs/design-system.md`: linguagem visual da interface. Aqui ficam os tokens de cor, tipografia, espaçamento, raio e sombra, os estados de interação, os componentes, o comportamento responsivo e o fluxo de trabalho com o Figma.
5. `docs/harness.md`: como o trabalho dos agentes é verificado. Aqui ficam o script de verificação, a CI, a política do que bloqueia e do que só avisa e o que ficou de fora.

Cada projeto tem o próprio `AGENTS.md`, com os comandos, as particularidades da stack e as práticas de código dele:

- `apps/api/AGENTS.md`: API em NestJS.
- `apps/web/AGENTS.md`: frontend em Next.js.

**Onde cada informação mora**

- **O que o sistema faz** fica em `docs/`: escopo, arquitetura, esquema, contrato, regras de negócio e configuração.
- **Nunca nos dois.** Uma informação tem um dono só, e o outro arquivo aponta para ele pelo nome do documento e da seção, sem repetir o conteúdo.

<!-- instruções para fins didáticos -->
**Arquivos que não devem ser lidos**

Os caminhos abaixo existem para quem lê o repositório, e não para os agentes. **Nunca os leia nem os edite**, nem para buscar contexto de uma tarefa:

- `docs/sessoes/`: transcrições de sessões anteriores. São longas e registram decisões que podem ter mudado depois. A decisão vigente está no documento dono dela.
- `docs/specs/`: cópia das specs e dos tickets, tirada do Linear só para conferência. Ela não acompanha as mudanças feitas depois. A fonte é o Linear, como descrito em [Issues e tickets no Linear](#issues-e-tickets-no-linear).
- `docs/Gerenciador de arquivos.fig`: exportação binária do arquivo do Figma. O design é lido pelo servidor MCP do Figma, como descrito em [Design e Figma](#design-e-figma).

O `.claude/settings.json` nega a leitura e a escrita nesses caminhos.
<!-- instruções para fins didáticos -->

## Execução no Docker

Tudo roda dentro dos contêineres do Docker Compose: instalação de dependências, servidor de desenvolvimento, testes, lint, compilação do TypeScript e qualquer outro comando do projeto. **Nunca rode `pnpm`, `node` ou `npx` direto na máquina.**

O ambiente de desenvolvimento usa o `compose.dev.yaml`, na raiz, com cinco serviços:

| Serviço | O que é | Endereço na máquina | Endereço entre contêineres |
| --- | --- | --- | --- |
| `web` | Frontend em Next.js | `http://localhost:3000` | `http://web:3000` |
| `api` | API em NestJS, com as rotas sob `/v1` | `http://localhost:3001` | `http://api:3000` |
| `postgres` | Banco PostgreSQL (usuário, senha e banco `app`) | Não é publicado | `postgres:5432` |
| `mailpit` | Captura os e-mails enviados e os mostra numa tela | `http://localhost:8025` | SMTP em `mailpit:1025` e API HTTP em `http://mailpit:8025` |
| `playwright` | Navegadores dos testes da web | Não é publicado | Não recebe conexões |

Os contêineres `web` e `api` preparam o próprio ambiente ao subir e depois ficam parados, sem iniciar a aplicação. O `playwright` também fica parado. Os comandos rodam neles com `docker compose -f compose.dev.yaml exec <serviço> <comando>`, e os de cada projeto, inclusive os testes no `playwright`, estão no `AGENTS.md` dele.

### Subir e derrubar

```bash
docker compose -f compose.dev.yaml up -d --build --wait
docker compose -f compose.dev.yaml exec web pnpm dev --hostname 0.0.0.0
docker compose -f compose.dev.yaml exec api pnpm start:dev
```

O `--wait` segura o primeiro comando até os cinco serviços ficarem prontos, o que inclui a instalação das dependências e as migrações. Na primeira subida, isso leva alguns minutos. Os outros dois ficam presos ao terminal, então rode cada um em segundo plano. O `--hostname 0.0.0.0` é necessário para que a web aceite conexões de fora do contêiner.

**Derrubar**

```bash
docker compose -f compose.dev.yaml down
```

As dependências instaladas, o `.env` e os dados do banco continuam e são reaproveitados na próxima subida.

**Recomeçar do zero**

```bash
docker compose -f compose.dev.yaml down -v
```

O `-v` apaga o volume do banco. Na subida seguinte, o banco é recriado e as migrações são aplicadas de novo. Para gerar também um `.env` e chaves novas, apague o `apps/api/.env` antes de subir.

### Quando a API não sobe

Se o `up --wait` terminar com erro, veja a causa com `docker compose -f compose.dev.yaml logs api`.

Quando a preparação da API falha (uma migração quebrada, um `.env` incompleto), o contêiner `api` encerra e o `exec` deixa de funcionar nele. Para consertar, rode o comando num contêiner avulso, que não passa pela preparação:

```bash
docker compose -f compose.dev.yaml run --rm api <comando>
```

Depois do conserto, suba o ambiente de novo.

### Banco e e-mails

- **Banco:** para abrir um console SQL, rode `docker compose -f compose.dev.yaml exec postgres psql -U app app`.
- **E-mails:** tudo o que a API envia fica no `mailpit`, nos endereços da tabela.

### Rede entre serviços

Na conexão entre serviços (banco, storage, e-mail, worker), seja em variável de ambiente, arquivo de configuração ou código, **o host é sempre o nome do serviço do Compose**, como na coluna "Endereço entre contêineres" da tabela, e nunca `localhost` nem `127.0.0.1`: dentro de um contêiner, `localhost` é o próprio contêiner.

**Exceção:** quando o processo fala com algo que roda no mesmo contêiner, o endereço é `127.0.0.1`. É o caso do healthcheck de um serviço, que confere o próprio contêiner, e de um teste que abre um servidor temporário no contêiner onde roda.

## Princípios de trabalho

- **Responsabilidade única:** cada módulo e cada função tem uma responsabilidade clara. Reavalie isso a cada passo. Quando um módulo começa a criar ou alterar entidades de outro domínio, extraia a lógica para o módulo certo na hora, em vez de deixar para uma tarefa futura.
- **Tipagem:** TypeScript estrito em todas as camadas.
- **Testes:** pirâmide de testes em todos os níveis (unitários, de integração e end-to-end).
- **Qualidade de código:** lint e formatação automáticos, com as ferramentas de cada projeto.

## Design e Figma

O Figma é a ferramenta de design do projeto, acessada pelo servidor MCP do plugin `figma`.

**Arquivo do Figma:** <https://www.figma.com/design/wtW40yW0bpzoLvICwZMELG/Gerenciador-de-arquivos>

**Sempre que a tarefa envolver design ou interface, leia antes o `docs/design-system.md`**, seja para desenhar no Figma, seja para implementar uma tela ou um componente no código. Ele define os tokens, os componentes e o fluxo de trabalho com o Figma (sincronia, passos do Figma para o código, assets e validação visual), e as regras dele são obrigatórias.

## Definição de pronto

Uma mudança no código está pronta quando:

1. O `scripts/verify.sh full` aprova. Ele é a definição de "passou": tipos, lint, todas as suítes, o build da web, a tabela de aceite e os segredos. O que cada passo confere está no `docs/harness.md`, seção "Script de verificação".
2. Em mudança de interface, a validação visual descrita em `docs/design-system.md` foi feita. É a única exigência que o script não confere.

Rode o script da raiz do repositório, na máquina (ele mesmo chama os contêineres), com a web e a API no ar:

```bash
scripts/verify.sh full
```

- **Durante o desenvolvimento, feedback curto.** Rode os testes ligados ao código alterado, com os comandos de um arquivo ou de um teste do `AGENTS.md` do projeto, ou o `scripts/verify.sh full <app>` para uma app inteira. Nenhum dos dois libera o push.
- **Falha se corrige na causa, na mesma tarefa.** Erro de tipo, de lint ou de teste nunca fica como dívida para uma tarefa futura.
- **O veredito é o da CI.** Ela roda esse mesmo comando em todo pull request. Passar na máquina é condição para abrir o PR, e não prova de que a mudança está pronta.
- **Não contorne uma verificação.** Não pule teste (`.skip`, `.only`, `.todo`, `.fixme`), não apague teste que falha e não altere o script nem o workflow para fazer a mudança passar. A CI reprova teste pulado e suíte vazia.
- **Depois de duas reprovações da CI no mesmo PR, pare** e avise o usuário, em vez de tentar a terceira correção.

**Antes do push**

Um hook confere todo `git push` que você faz e o nega em dois casos: quando os commits da branch trazem um segredo, e quando o modo completo não aprovou o conteúdo do último commit. Para o push passar:

1. Faça o commit de tudo que alterou. A aprovação vale para o que foi verificado, e o push envia o que está em commit.
2. Em branch que altera código em `apps/`, salve o corpo do pull request num arquivo, com a tabela de aceite.
3. Rode `ACCEPTANCE_BODY_FILE=<arquivo> scripts/verify.sh full`. Em branch que não altera `apps/`, a variável é dispensável.
4. Faça o push.

- **O que invalida a aprovação:** qualquer mudança em `apps/`, no `compose.dev.yaml` ou em `scripts/`. Mudança só em documento fora desses caminhos não invalida, e uma branch que só altera esse tipo de documento não precisa de aprovação. O `AGENTS.md` de um projeto fica em `apps/`, então alterá-lo invalida.
- **Não contorne o bloqueio.** Se um push sem verificação for mesmo necessário, como o de um trabalho pela metade, peça ao usuário, que o faz no terminal.

**Tabela de aceite no pull request**

Todo pull request que altera código em `apps/` traz, no corpo, a seção `## Tabela de aceite`, com uma linha por critério de aceite e o teste que o prova:

```markdown
## Tabela de aceite

| Critério | Arquivo de teste | Nome do teste |
| --- | --- | --- |
| O login bloqueia a sexta tentativa | apps/api/test/auth-rate-limit.e2e-spec.ts | devolve rate_limited na sexta tentativa, exista ou não o Usuário, com a mesma resposta |
| O Usuário entra e sai pela interface | apps/web/e2e/session.spec.ts | o Usuário entra, vê o próprio e-mail na página provisória e sai |
```

- **Critério:** os critérios de aceite do ticket, um por linha, sem pular nenhum. Em PR sem ticket, os critérios do próprio PR.
- **Arquivo de teste:** o caminho a partir da raiz do repositório.
- **Nome do teste:** o nome exato, como está no `it` ou no `test`. Quando o mesmo nome se repete no arquivo, use o nome completo, com os `describe` separados por ` › `.
- **Um teste por linha.** Se um critério precisa de dois testes, repita o critério em duas linhas.
- **Critério sem teste não entra na tabela:** escreva o teste. A CI reprova linha incompleta, teste inexistente, teste que falhou e teste pulado.

A tabela é conferida na máquina antes do push, como descrito em "Antes do push".

**Revisão em contexto novo**

Quem escreveu o código não é quem o revisa. Todo pull request que altera código em `apps/` passa pelo subagente `revisor`, que não viu a implementação. Ela é a revisão que vale para o PR; uma revisão feita na mesma sessão que escreveu o código não a substitui.

1. **Gere o diff num arquivo,** com a implementação terminada, a verificação completa passando e tudo commitado:

   ```bash
   git status --short
   git diff origin/main...HEAD > "$(git rev-parse --git-dir)/harness/review.diff"
   ```

   O diff só traz o que está em commit. O `git status --short` precisa sair sem nenhuma linha da mudança: arquivo alterado, preparado ou novo que fique de fora do commit fica também de fora da revisão, sem aviso.

2. **Chame o subagente `revisor`** passando só o caminho desse arquivo e o identificador do ticket. Em PR sem ticket, passe os critérios de aceite. Não passe o seu resumo da mudança, a sua opinião sobre ela nem o que você acha que merece atenção: o valor da revisão está em ela não partir das suas conclusões.
3. **Corrija os achados com que você concorda,** faça o commit das correções e rode a verificação de novo.
4. **Publique o resultado como comentário no PR,** com o título `## Revisão em contexto novo`, neste formato:

   ```markdown
   ## Revisão em contexto novo

   | # | Severidade | Achado | Situação | Motivo |
   | --- | --- | --- | --- | --- |
   | 1 | alta | O que o revisor apontou | Corrigido | O que mudou, e em que commit |
   | 2 | média | O que o revisor apontou | Não corrigido | Por que ficou como está |

   <details>
   <summary>Relatório do revisor, na íntegra</summary>

   (o relatório, sem edição)

   </details>
   ```

- **Todo achado entra na tabela,** inclusive o que você considera errado. Nesse caso, a situação é "Não corrigido" e o motivo diz por quê. Não omita achado nem edite o relatório.
- **A revisão não bloqueia.** O que fazer com um achado não corrigido é decisão do usuário no merge. A CI não lê esse comentário.
- **Sem achados também é resultado:** publique o comentário mesmo assim, com o relatório.
- **Em agente sem subagentes,** faça a revisão numa sessão nova, com as instruções de `.claude/agents/revisor.md`, e publique o comentário do mesmo jeito.

O desenho e os limites da revisão estão em `docs/harness.md`, seção "Revisor em contexto novo". O desenho e os motivos das demais verificações estão no mesmo documento, na seção de cada uma.

Os comandos de teste, de lint e de formatação de cada projeto estão no `AGENTS.md` dele.

Rode todos eles dentro do contêiner do projeto, como descrito em [Execução no Docker](#execução-no-docker).

## Issues e tickets no Linear

O Linear é o gerenciador de issues do projeto, acessado pelo servidor MCP `linear-server`. Specs e tickets vivem lá, e não em arquivos do repositório.

- **Time:** Luiz Carlos (`LUI`).
- **Projeto:** gerenciador de arquivos.
- **Labels de tipo:** `Feature`, `Bug` e `Improvement`.
- **Label de triagem:** `ready-for-agent`, para a issue já especificada, que um agente pode pegar sem triagem adicional.

**Da funcionalidade ao ticket**

1. **Planejamento:** as decisões são fechadas com o usuário e registradas no documento dono delas: as de produto em `docs/` (LLD e, se houver termo novo, `GLOSSARY.md`), e as de prática de código no `AGENTS.md` do projeto.
2. **Spec:** uma issue por funcionalidade, com o problema, a solução, as histórias de usuário, as decisões de implementação e de teste e o que fica fora de escopo.
3. **Tickets:** sub-issues da spec. Cada ticket é uma fatia vertical, que atravessa banco, API, interface e testes e pode ser verificada sozinha. Tickets de preparação (ambiente, base de componentes) são a exceção e vêm primeiro.
4. **Bloqueios:** as dependências entre tickets são a relação nativa do Linear ("blocked by"), e não texto na descrição.

**Regras de escrita**

- Specs e tickets são escritos em português, com o vocabulário do `GLOSSARY.md`.
- Não cite caminhos de arquivo nem trechos de código: eles envelhecem rápido. Cite documentos e módulos pelo nome.
- Todo ticket traz critérios de aceite verificáveis. Cada critério leva um ID `CA<n>` e uma marca de conferência, como descrito em [Plano do ticket](#plano-do-ticket).
- A spec e os tickets levam `ready-for-agent` e uma label de tipo.

**Ao trabalhar em um ticket**

- Pegue só tickets cujos bloqueios já foram concluídos.
- Leia o ticket e a spec pai antes de começar. O contrato e as regras completas estão no LLD.
- Planeje o ticket com a `/plan-ticket` e só implemente depois do commit de plano, como descrito em [Plano do ticket](#plano-do-ticket).
- Use o identificador da issue no nome da branch, por exemplo `feature/lui-137-cadastro-e-verificacao`.
- Mova a issue para "In Progress" ao começar. Ela só é concluída quando todos os critérios de aceite e a [definição de pronto](#definição-de-pronto) passam.
- Não feche nem edite a spec pai ao concluir um ticket.
- Se a implementação mudar uma decisão, atualize o documento dono dela (o LLD ou o `AGENTS.md` do projeto) e o ticket na mesma tarefa.

### Plano do ticket

Cada ticket é planejado no início dele, e não na criação dos tickets, e só então implementado. O desenho e os motivos estão em `docs/harness.md`, seção "Plano do ticket (planejado)".

1. **Planejar:** rode a `/plan-ticket` com o identificador do ticket. Ela escreve o plano e para, sem commit.
2. **Aprovar:** o usuário revisa o diff do plano. Só depois da aprovação você faz o commit de plano, com a lista de arquivos e interfaces na mensagem.
3. **Implementar:** numa sessão nova, a partir do commit de plano e do arquivo de aceite, com a skill `tdd`. Os seams e a lista de testes já vêm do plano.

**Critérios do ticket**

- **ID:** `CA<n>` no ticket, e `<ticket>-CA<n>` fora do Linear, como `LUI-146-CA3`. O número nunca muda: critério novo pega o próximo, e critério removido deixa o número vago.
- **Marca de conferência:** teste HTTP, teste no Playwright, teste de unidade, revisão humana ou documento. Só as três primeiras são provadas por teste. A definição de pronto não é critério de ticket.
- **Formato:** `- [ ] **CA3** · Texto do critério (teste HTTP).`

**Arquivo de aceite**

- **Onde:** `docs/aceite/<ticket>.md`, um por ticket, permanente. O texto do critério fica só no Linear.
- **O que traz, por ID:** a marca, o cenário em Dado, Quando, Então e, nos critérios de teste, o teste previsto (camada, arquivo e nome).
- **Desenho:** o contrato e o schema vão direto para o LLD, que é o dono deles. A lista de arquivos e interfaces fica só na mensagem do commit de plano.
- **Congelado depois do commit de plano:** não altere o arquivo de aceite. Descongelar é do usuário, no editor ou no terminal. O que se congela é o ID e o cenário: o teste previsto é só uma previsão, e não se corrige o arquivo quando o teste muda de nome ou de lugar, porque a ligação é o ID.
- **Mecanismo:** por ora, o congelamento e o ID no teste são regras sem verificação automática. A cobertura por IDs e o bloqueio da edição vêm em tickets próprios (ver `docs/harness.md`).

**Teste de aceite**

- **ID no título:** cada teste de aceite leva no título o token `@<ticket>-CA<n>`, com o `@`, como `@LUI-146-CA3`. O nome e o arquivo podem mudar durante o ciclo da `tdd`, porque a ligação com o critério é o ID.
- **Transição:** a tabela de aceite do pull request, descrita em "Tabela de aceite no pull request", continua valendo até a cobertura por IDs entrar na CI. Nela entram só os critérios provados por teste: os de revisão humana e de documento ficam fora.

## Convenções de Git

- **Branch principal:** `main`. Nunca faça commit direto nela.
- **Branches de trabalho:** `feature/*`, `bugfix/*`, `hotfix/*` e `docs/*`, criadas a partir da `main` e integradas por pull request.
- **Commits:** mensagens curtas e descritivas, focadas no porquê da mudança.
- **Merge:** quem faz o merge é o usuário, nunca o agente, nem a pedido. O `.claude/settings.json` nega o `gh pr merge`, e não use outro caminho para fazê-lo.
- **Arquivos do harness:** `.github/`, `.claude/settings.json`, `.claude/hooks/`, `.claude/agents/` e `scripts/` só mudam quando a tarefa é sobre o harness. Um pull request que os altera é reprovado pelo check `Guarda do harness` e só entra por override do usuário, como descrito em `docs/harness.md`, seção "Proteção da `main` e guarda do harness". Avise isso ao abrir o PR.

## Consulta à documentação de bibliotecas

Quando precisar consultar a documentação de uma biblioteca, use o context7 para buscar informações atualizadas e precisas.

## Agent Skill Usage


Quando estiver trabalhando em uma tarefa, primeiro decomponha a solicitação em suas subtarefas e preocupações subjacentes, depois identifique quais skills disponíveis correspondem a alguma delas e ative essas skills.

Quando uma skill diverge deste arquivo, do `AGENTS.md` do projeto ou dos documentos de `docs/`, valem estes.