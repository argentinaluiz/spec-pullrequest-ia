# AGENTS.md

## Documentos

Em `docs/` estão os documentos que definem o produto, a arquitetura e os detalhes de implementação. Abaixo estão os principais do projeto:

1. `docs/product-brief.md`: o quê e para quem. Escopo do MVP, o que fica fora, planos e métricas.
2. `docs/hld.md`: High-level design, documento de arquitetura de alto nível. Aqui ficam as decisões de arquitetura, os fluxos principais e a visão geral do sistema.
3. `docs/lld.md`: Low-level design, documento de arquitetura de baixo nível. Aqui ficam a estrutura de pastas, as bibliotecas escolhidas, os esquemas de banco, os contratos de API, os estados, as regras de cota, as tarefas do worker, o upload em chunks e as variáveis de ambiente, os componentes da API e como se comunicam, e o comportamento da web: o mapa de rotas e telas, a Sessão no navegador, a entrega de arquivos e a reação aos erros da API.
4. `docs/design-system.md`: linguagem visual da interface. Aqui ficam os tokens de cor, tipografia, espaçamento, raio e sombra, os estados de interação, os componentes, o comportamento responsivo e o fluxo de trabalho com o Figma.

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

O ambiente de desenvolvimento usa o `compose.dev.yaml`, na raiz, com seis serviços:

| Serviço | O que é | Endereço na máquina (slot 0) | Endereço entre contêineres |
| --- | --- | --- | --- |
| `web` | Frontend em Next.js | `http://localhost:3000` | `http://web:3000` |
| `api` | API em NestJS, com as rotas sob `/v1` | `http://localhost:3001` | `http://api:3000` |
| `postgres` | Banco PostgreSQL (usuário, senha e banco `app`) | Não é publicado | `postgres:5432` |
| `storage` | Emulador do Cloud Storage (`fake-gcs-server`), com o bucket `app-files` | `http://localhost:4443` | `http://storage:4443` |
| `mailpit` | Captura os e-mails enviados e os mostra numa tela | `http://localhost:8025` | SMTP em `mailpit:1025` e API HTTP em `http://mailpit:8025` |
| `playwright` | Navegadores dos testes da web | Não é publicado | Não recebe conexões |

A tabela é a do slot 0, o de um checkout sem `.env` na raiz. As portas e os endereços de um slot de 1 a 3 estão no `docs/lld.md`, seção 6, "Ambiente local por slot".

Os contêineres `web` e `api` preparam o próprio ambiente ao subir e depois ficam parados, sem iniciar a aplicação. O `playwright` também fica parado. Os comandos rodam neles com `docker compose -f compose.dev.yaml exec <serviço> <comando>`, e os de cada projeto, inclusive os testes no `playwright`, estão no `AGENTS.md` dele.

O `web` e o `playwright` montam a pasta da web em `/app`, e o `api`, a da API. O `api` monta também o repositório em `/repo`, só para leitura e sem o `.git`, onde roda o Node do harness (o "Comando do Node" dos valores da skill de plano, abaixo).

### Subir e derrubar

```bash
docker compose -f compose.dev.yaml up -d --build --wait
docker compose -f compose.dev.yaml exec web pnpm dev --hostname 0.0.0.0
docker compose -f compose.dev.yaml exec api pnpm start:dev
```

O `--wait` segura o primeiro comando até os seis serviços ficarem prontos, o que inclui a instalação das dependências e as migrações. Na primeira subida, isso leva alguns minutos. Os outros dois ficam presos ao terminal, então rode cada um em segundo plano. O `--hostname 0.0.0.0` é necessário para que a web aceite conexões de fora do contêiner.

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

## Frentes paralelas

Cada ticket pode correr numa **frente**: um checkout próprio, na branch do ticket, com a própria sessão do agente, o próprio ambiente Docker e o próprio PR. A primeira frente pode ser o checkout principal, no slot 0, com as portas da tabela de "Execução no Docker"; da segunda em diante, cada frente é um worktree numa pasta irmã do principal, que se abre com `cd` e o Claude Code, com o slot (de 1 a 3) que dá a ela um bloco próprio de portas. O principal conta como frente quando está numa branch que não é a `main`, e o limite é de 3 frentes ao todo.

- **Criar:** `scripts/frentes.sh novo <ticket> [tipo]` cria a pasta, a branch, o `.env` do slot e o ambiente, e imprime o comando para abrir a sessão.
- **Listar:** `scripts/frentes.sh listar` mostra o slot, a branch, as portas e o estado do PR de cada frente.
- **Remover:** `scripts/frentes.sh remover <ticket>` desmonta a frente depois do merge do PR, com a pasta limpa. O `--forcar` abandona um ticket sem merge e é só do usuário: o agente não o usa, e um hook o nega.

**Trazer a `main` para a frente:** use a `/sincronizar` quando o PR da frente fica desatualizado em relação à `main` (o ruleset não deixa mergear um PR assim) e no fim do ticket, antes do `full`, para a única verificação completa rodar contra a `main` atual. Os passos e a regra de cada tipo de conflito estão na skill.

As regras de cada comando (a fórmula do slot, o `.env`, as recusas e a remoção) estão no cabeçalho do `scripts/frentes.sh`, e o contrato das variáveis do `.env`, na LLD. O script não fala com o Linear: mover a issue para "In Progress" é da sessão do ticket.

**Navegador:** os MCPs de navegador do projeto abrem um perfil isolado por instância (`--isolated` no `.mcp.json`), então duas sessões validam telas ao mesmo tempo, e o login feito num deles não persiste para a próxima sessão. No navegador do usuário, os cookies de dois slots colidem, porque o navegador não os separa por porta, e o login de um derruba o do outro: use um slot por janela anônima, ou por perfil do navegador.

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

1. O `scripts/verify.sh full` aprova. Ele é a definição de "passou": tipos, lint, todas as suítes, o build da web, o aceite e os segredos. O que cada passo confere está no cabeçalho e nos grupos de `scripts/verify.sh`.
2. Em mudança de interface, a validação visual descrita em `docs/design-system.md` foi feita. É a única exigência que o script não confere.

Rode o script da raiz do repositório, na máquina (ele mesmo chama os contêineres), com a web e a API no ar:

```bash
scripts/verify.sh full
```

- **Durante o desenvolvimento, só os testes do que mudou.** Rode os testes ligados aos arquivos alterados, com os comandos de um arquivo ou de um teste do `AGENTS.md` do projeto. O hook de fim de turno já confere os tipos e o lint, com o `scripts/verify.sh fast`. O `scripts/verify.sh full <app>` continua no script, mas não é o feedback do dia a dia.
- **O `full` roda uma vez, no fim da tarefa,** antes do commit que a fecha, e quem o roda é quem faz esse commit. No fluxo de ticket, é a sessão principal, depois da `/simplify`, da `/code-review` e da revisão de conformidade (ver "Revisão de conformidade").
- **Rode o `full` em segundo plano.** Com vários checkouts na máquina, ele espera a vez dos outros (o cabeçalho do `scripts/verify.sh` descreve o semáforo), e a espera somada ao `full` pode passar do limite de um comando.
- **Subagente não roda o `full`.** Se você recebeu a tarefa de outro agente (implementar, corrigir achados, revisar), termine com os testes do que mudou e devolva o resultado, dizendo o que rodou: o `full` é de quem o chamou, mesmo que a tarefa pareça terminada.
- **Falha se corrige na causa, na mesma tarefa.** Erro de tipo, de lint ou de teste nunca fica como dívida para uma tarefa futura. Depois de uma reprovação, rode o `full` de novo só depois de corrigir a causa.
- **Na terceira reprovação seguida nos mesmos passos, o `full` trava.** Pare e peça ao usuário que examine a falha e rode `! scripts/verify.sh unlock`; só ele destrava. Não rode o `verify.sh` com `CI=` nem `GITHUB_ACTIONS=`, que desligariam a trava.
- **O veredito é o da CI.** Ela roda esse mesmo comando em todo pull request. Passar na máquina é condição para abrir o PR, e não prova de que a mudança está pronta.
- **Não contorne uma verificação.** Não pule teste (`.skip`, `.only`, `.todo`, `.fixme`), não apague teste que falha e não altere o script nem o workflow para fazer a mudança passar. A CI reprova teste pulado e suíte vazia.
- **Depois de duas reprovações da CI no mesmo PR, pare** e avise o usuário, em vez de tentar a terceira correção.

**Antes do push**

Um hook confere todo `git push` que você faz e o nega em dois casos: quando os commits da branch trazem um segredo, e quando o modo completo não aprovou o conteúdo do último commit. Para o push passar:

1. Faça o commit de tudo que alterou. A aprovação vale para o que foi verificado, e o push envia o que está em commit.
2. Em branch que altera código em `apps/`, salve o corpo do pull request num arquivo, com a seção `## Aceite`.
3. Rode `ACCEPTANCE_BODY_FILE=<arquivo> scripts/verify.sh full`. Em branch que não altera `apps/`, a variável é dispensável.
4. Faça o push.

- **O que invalida a aprovação:** qualquer mudança em `apps/`, no `compose.dev.yaml`, em `scripts/`, nos scripts da skill de plano (`.claude/skills/plan-ticket/scripts/`) ou num arquivo de aceite (`docs/tickets/<issue>/<ticket>/aceite.md`). Mudança só em documento fora desses caminhos não invalida, e uma branch que só altera esse tipo de documento não precisa de aprovação. O `AGENTS.md` de um projeto fica em `apps/`, então alterá-lo invalida.
- **Não contorne o bloqueio.** Se um push sem verificação for mesmo necessário, como o de um trabalho pela metade, peça ao usuário, que o faz no terminal.

**Aceite no pull request**

Todo pull request que altera código em `apps/` traz, no corpo, a seção `## Aceite`, que diz qual arquivo de aceite o PR cumpre:

```markdown
## Aceite

docs/tickets/<issue>/<ticket>/aceite.md
```

- **Com ticket:** o caminho do arquivo de aceite do ticket, criado pelo commit de plano: `docs/tickets/<issue>/<ticket>/aceite.md`. Os critérios e os testes não se repetem no PR.
- **Sem aceite novo:** escreva `nenhum` seguido do motivo, como "nenhum: refatoração sem mudança de comportamento". Vale para refatoração, mudança no harness e documento.
- **O que a CI confere,** em todos os arquivos de aceite de `docs/tickets/` e não só no do ticket: todo critério com marca de teste tem ao menos um teste com o ID numa tag que rodou e passou; o teste que ainda traz o ID no título e não tem tag reprova; nenhum teste cita um ID que não está num arquivo de aceite; nenhum teste com ID foi pulado; o arquivo citado existe. Critério com marca de revisão humana ou de documento não exige teste.
- **Critério sem teste:** escreva o teste, com o ID numa tag (formato em `.claude/skills/plan-ticket/formatos/aceite.md`, seção "Teste de aceite"). Não cite um teste que não tenha relação com o critério: a CI só prova que ele existe e passou, e quem julga se ele prova o critério é o revisor.

O aceite é conferido na máquina antes do push, como descrito em "Antes do push".

**Revisão de conformidade**

Quem escreveu o código não é quem o confere. Toda mudança que altera código em `apps/` passa pelo subagente `revisor-conformidade`, que não viu a implementação e confere se ela entrega o que foi planejado: o aceite, os testes contra os cenários, o contrato e o schema contra o commit de plano e os documentos donos. O que ele confere está no `REVIEW.md` da raiz, que o Copilot e o Claude Code Review também leem no PR. Os defeitos gerais de código ficam com a `/code-review`, e uma revisão feita na mesma sessão que escreveu o código não substitui esta.

No fluxo do ticket, ela vem depois da `/code-review` e antes do `full`, para as correções entrarem na única verificação completa: implementação, `/simplify`, `/code-review`, revisão de conformidade, correções, `full` e commit. A revisão não bloqueia: todo achado, corrigido ou não, vai para um comentário no PR, e a decisão sobre o que ficou sem corrigir é do usuário no merge. Como preparar a revisão, chamar o subagente, tratar os achados e publicar o comentário está na skill `revisao-conformidade`.

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
- Use o identificador da issue no nome da branch.
- Mova a issue para "In Progress" ao começar. Ela só é concluída quando todos os critérios de aceite e a [definição de pronto](#definição-de-pronto) passam.
- Não feche nem edite a spec pai ao concluir um ticket.
- Se a implementação mudar uma decisão, atualize o documento dono dela (o LLD ou o `AGENTS.md` do projeto) e o ticket na mesma tarefa.

### Plano do ticket

Cada ticket é planejado no início dele, e não na criação dos tickets, e só então implementado.

1. **Planejar:** rode a `/plan-ticket` com o identificador do ticket. Ela escreve o plano e para, sem commit.
2. **Aprovar pela página:** a `/plan-ticket` para com a mensagem proposta do commit de plano e a página de revisão do plano, que traz também a visão legível do contrato e do schema, sem versionar nenhuma das duas; o usuário lê a página e responde no chat, e só depois da aprovação vem o commit de plano, com essa mensagem. O passo a passo e as abas da página estão na skill.
3. **Implementar:** numa sessão nova, a partir do commit de plano e do arquivo de aceite, com a skill `tdd`. Os seams e a lista de testes já vêm do plano. Num ticket sem critério de teste, como o de design, não há `tdd`: cada critério é entregue como o cenário dele descreve, e a definição de pronto só vale se o ticket alterar código.

**Os formatos são da skill.** A skill de plano, em `.claude/skills/plan-ticket/`, é a dona dos formatos do plano: o ID e a marca do critério, o arquivo de aceite e a tag do ID no teste (`formatos/aceite.md`), a mensagem do commit de plano (`formatos/mensagem.md`) e o contrato de rota e de tabela, com a saída do comando do contrato (`formatos/contrato.md`). Siga-os; aqui fica só o que é deste projeto.

**Valores da skill de plano**

- **Pasta dos tickets:** `docs/tickets`. O Git versiona nela só o arquivo de aceite de cada pasta de ticket.
- **Pasta dos documentos:** `docs`.
- **Comando do Node:** `scripts/node-in-api.sh`, que roda o Node no contêiner `api`, sobre o repositório montado em `/repo`, porque a máquina não roda `node`.
- **Comando do contrato:** `scripts/verify.sh contract`, a visão legível do contrato e do schema.
- **Arquivos do contrato:** `apps/api/openapi.json apps/api/prisma/schema.prisma`.

O atalho `scripts/verify.sh plan <issue> <ticket> [<commit de plano>]` chama o script da página da skill com esses valores (a `<issue>` é a issue pai do ticket, que vai no `--pai` do script); use-o nos passos de parada e de commit da skill.

**Neste projeto**

- **Desenho:** o contrato de rotas vai direto para o `apps/api/openapi.json`, e o schema das tabelas implementadas, para o `schema.prisma`: são os donos deles, conferidos por máquina. Como cada item do formato de rota e de tabela da skill se escreve neles está no `docs/lld.md` (seção 3, "Formato de uma rota no snapshot", e seção 2, "Formato de uma tabela no schema"). O LLD fica com as convenções, as regras e o que ainda não existe. A lista de arquivos e interfaces e a mudança de dados (seed, backfill) ficam na mensagem do commit de plano, como diz a skill em `formatos/mensagem.md`.
- **Congelamento:** o agente não altera um arquivo de aceite já em commit. Um hook nega a edição pelo agente, e a guarda do harness avisa no PR quando um aceite existente muda.
- **Cobertura:** a CI confere o ID na tag do teste, como descrito em "Aceite no pull request". O ID vai na tag, e não no título, porque os dois relatórios JSON, o do Vitest e o do Playwright, trazem as tags de cada teste. O `strictTags` do Vitest fica desligado nas configs da API e da web, porque quem valida o ID é o conferidor: um ID que não está em nenhum arquivo de aceite reprova. Os testes em shell do harness também provam critério: como nomear o caso e onde fica o relatório está no cabeçalho de `scripts/test/sh-helpers.sh`.

## Convenções de Git

- **Branch principal:** `main`. Nunca faça commit direto nela.
- **Branches de trabalho:** `feature/*`, `bugfix/*`, `hotfix/*` e `docs/*`, criadas a partir da `main` e integradas por pull request.
- **Commits:** mensagens curtas e descritivas, focadas no porquê da mudança.
- **Merge:** quem faz o merge é o usuário, nunca o agente, nem a pedido. O `.claude/settings.json` nega o `gh pr merge`, e não use outro caminho para fazê-lo.
- **Arquivos do harness:** `.github/`, `.claude/settings.json`, `.claude/hooks/`, `.claude/agents/`, `scripts/` e os scripts da skill de plano (`.claude/skills/plan-ticket/scripts/`) só mudam quando a tarefa é sobre o harness. Um pull request que os altera é reprovado pelo check `Guarda do harness` e só entra por override do usuário. Avise isso ao abrir o PR.

## Consulta à documentação de bibliotecas

Quando precisar consultar a documentação de uma biblioteca, use o context7 para buscar informações atualizadas e precisas.

## Agent Skill Usage


Quando estiver trabalhando em uma tarefa, primeiro decomponha a solicitação em suas subtarefas e preocupações subjacentes, depois identifique quais skills disponíveis correspondem a alguma delas e ative essas skills.

Quando uma skill diverge deste arquivo, do `AGENTS.md` do projeto ou dos documentos de `docs/`, valem estes.