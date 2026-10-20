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

O `web` e o `playwright` montam a pasta da web em `/app`, e o `api`, a da API. O `api` monta também o repositório em `/repo`, só para leitura e sem o `.git`, onde roda o Node do harness (o "Comando do Node" dos valores das skills do ticket, abaixo).

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

**Procedimentos raros**

Recomeçar do zero (apagar o volume do banco e recriá-lo) e consertar a API que não sobe, inclusive ver a causa de um `up --wait` que termina com erro, estão na skill `/ambiente` (`.claude/skills/ambiente/SKILL.md`).

### Banco e e-mails

- **Banco:** para abrir um console SQL, rode `docker compose -f compose.dev.yaml exec postgres psql -U app app`.
- **E-mails:** tudo o que a API envia fica no `mailpit`, nos endereços da tabela.

### Rede entre serviços

Na conexão entre serviços (banco, storage, e-mail, worker), seja em variável de ambiente, arquivo de configuração ou código, **o host é sempre o nome do serviço do Compose**, como na coluna "Endereço entre contêineres" da tabela, e nunca `localhost` nem `127.0.0.1`: dentro de um contêiner, `localhost` é o próprio contêiner.

**Exceção:** quando o processo fala com algo que roda no mesmo contêiner, o endereço é `127.0.0.1`. É o caso do healthcheck de um serviço, que confere o próprio contêiner, e de um teste que abre um servidor temporário no contêiner onde roda.

## Frentes paralelas

Cada ticket pode correr numa **frente**: um checkout próprio, na branch do ticket, com a própria sessão do agente, o próprio ambiente Docker e o próprio PR. A primeira frente pode ser o checkout principal, no slot 0, com as portas da tabela de "Execução no Docker"; da segunda em diante, cada frente é um worktree numa pasta irmã do principal, que se abre com `cd` e o Claude Code, com o slot (de 1 a 3) que dá a ela um bloco próprio de portas. O principal conta como frente quando não está na branch principal (a `main`), e isso inclui o HEAD solto, que não é estado de repouso; o limite é de 3 frentes ao todo. Em repouso, o principal fica na branch principal, atualizada com `git merge --ff-only <base>`. Para trabalhar nele, crie a branch do ticket a partir da base (`git switch -c feature/<ticket> <base>`), e ele vira a primeira frente.

Tudo o que diz respeito às frentes passa pelo `/worktree`, que tem cinco modos: `novo`, `listar`, `remover`, `abrir` e `sincronizar`. Os três primeiros também rodam no terminal, pelo atalho `.claude/skills/ambiente/scripts/frentes.sh`.

- **Criar:** `/worktree novo <ticket> [tipo]` (no terminal, `.claude/skills/ambiente/scripts/frentes.sh novo <ticket> [tipo]`) cria a pasta, a branch, o `.env` do slot e o ambiente, e imprime o comando para abrir a sessão.
- **Listar:** `/worktree listar` (no terminal, `.claude/skills/ambiente/scripts/frentes.sh listar`) mostra o slot, a branch, as portas e o estado do PR de cada frente.
- **Remover:** `/worktree remover <ticket>` (no terminal, `.claude/skills/ambiente/scripts/frentes.sh remover <ticket>`) desmonta a frente depois do merge do PR, com a pasta limpa. O `--forcar` abandona um ticket sem merge e é só do usuário: o agente não o usa, e um hook o nega. Depois que o usuário mergeia o PR, o agente só roda o `remover` se ele pedir.

**Abrir as frentes de uma spec:** use o `/worktree abrir` com o identificador da spec. Ela lê os tickets e os bloqueios no Linear, escolhe os que já podem começar, confirma a lista com o usuário e cria uma frente por ticket. A sessão de cada frente é aberta pelo usuário na pasta dela.

**Trazer a `main` para a frente:** use o `/worktree sincronizar` quando o PR da frente fica desatualizado em relação à `main` (o ruleset não deixa mergear um PR assim) e no fim do ticket, antes do `full`, para a única verificação completa rodar contra a `main` atual. Os passos e a regra de cada tipo de conflito estão na skill.

O `.claude/skills/ambiente/scripts/frentes.sh` é o atalho (o "Comando das frentes" dos valores do `/worktree`): chama o núcleo das frentes (`.claude/skills/worktree/scripts/frentes.sh`) com os valores deste projeto, o limite de 3, o ambiente por slot (`.claude/skills/ambiente/scripts/frente-ambiente.sh`) e os pontos de convergência. As regras de cada comando (a numeração e a guarda do slot, as recusas e a remoção) estão no cabeçalho do núcleo; o `.env` do slot, as portas e o Compose, no do comando de ambiente, e o contrato das variáveis do `.env`, na LLD. O script não fala com o Linear: mover a issue para "In Progress" é da sessão do ticket.

**Navegador:** os MCPs de navegador do projeto abrem um perfil isolado por instância (`--isolated` no `.mcp.json`), então duas sessões validam telas ao mesmo tempo, e o login feito num deles não persiste para a próxima sessão. No navegador do usuário, os cookies de dois slots colidem, porque o navegador não os separa por porta: o slot 1 recebe os cookies do slot 0, recusa a Sessão e apaga os cookies, e o login do slot 0 cai junto. Janelas e abas anônimas da mesma sessão do navegador dividem os cookies, então não resolvem. Abra cada slot num perfil do navegador diferente, um perfil por slot.

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

1. O `.claude/skills/verificar/scripts/verify.sh full` aprova. Ele é a definição de "passou": tipos, lint, todas as suítes, o build da web, o aceite e os segredos. O que cada passo confere está no cabeçalho e nos grupos de `.claude/skills/verificar/scripts/verify.sh`.
2. Em mudança de interface, a validação visual descrita em `docs/design-system.md` foi feita. É a única exigência que o script não confere.

Rode o script da raiz do repositório, na máquina (ele mesmo chama os contêineres), com a web e a API no ar:

```bash
.claude/skills/verificar/scripts/verify.sh full
```

- **Durante o desenvolvimento, só os testes do que mudou.** Rode os testes ligados aos arquivos alterados, com os comandos de um arquivo ou de um teste do `AGENTS.md` do projeto. O hook de fim de turno já confere os tipos e o lint, com o `.claude/skills/verificar/scripts/verify.sh fast`. O `.claude/skills/verificar/scripts/verify.sh full <app>` continua no script, mas não é o feedback do dia a dia.
- **O `full` roda uma vez, no fim da tarefa,** depois do commit do trabalho e do `/worktree sincronizar`, e quem o roda é quem fecha a tarefa. No fluxo de ticket, é a sessão do ticket, na frente, e nunca um subagente, depois da `/simplify`, da `/code-review` e da revisão de conformidade (ver "Revisão de conformidade"). Uma nova sincronização com a `main`, quando o PR fica velho, pede outro `full`.
- **Rode o `full` em segundo plano.** Com vários checkouts na máquina, ele espera a vez dos outros (o cabeçalho do `.claude/skills/verificar/scripts/verify.sh` descreve o semáforo), e a espera somada ao `full` pode passar do limite de um comando.
- **Subagente não roda o `full`.** Se você recebeu a tarefa de outro agente (implementar, corrigir achados, revisar), termine com os testes do que mudou e devolva o resultado, dizendo o que rodou: o `full` é de quem o chamou, mesmo que a tarefa pareça terminada.
- **Falha se corrige na causa, na mesma tarefa.** Erro de tipo, de lint ou de teste nunca fica como dívida para uma tarefa futura. Depois de uma reprovação, rode o `full` de novo só depois de corrigir a causa.
- **Na terceira reprovação seguida nos mesmos passos, o `full` trava.** Pare e peça ao usuário que examine a falha e rode `! .claude/skills/verificar/scripts/verify.sh unlock`; só ele destrava. Não rode o `verify.sh` com `CI=` nem `GITHUB_ACTIONS=`, que desligariam a trava.
- **O veredito é o da CI.** Ela roda esse mesmo comando em todo pull request. Passar na máquina é condição para abrir o PR, e não prova de que a mudança está pronta.
- **Não contorne uma verificação.** Não pule teste (`.skip`, `.only`, `.todo`, `.fixme`), não apague teste que falha e não altere o script nem o workflow para fazer a mudança passar. A CI reprova teste pulado e suíte vazia.
- **Depois de duas reprovações da CI no mesmo PR, pare** e avise o usuário, em vez de tentar a terceira correção.

**Antes do push**

Um hook confere todo `git push` que você faz e o nega em dois casos: quando os commits da branch trazem um segredo, e quando o modo completo não aprovou o conteúdo do último commit. Para o push passar:

1. Faça o commit de tudo que alterou. A aprovação vale para o que foi verificado, e o push envia o que está em commit.
2. Em branch que altera código em `apps/`, salve o corpo do pull request num arquivo, com a seção `## Aceite`.
3. Rode `ACCEPTANCE_BODY_FILE=<arquivo> .claude/skills/verificar/scripts/verify.sh full`. Em branch que não altera `apps/`, a variável é dispensável.
4. Faça o push.

- **O que invalida a aprovação:** qualquer mudança em `apps/`, no `compose.dev.yaml`, nas pastas `scripts/` e `hooks/` de qualquer skill (`.claude/skills/<skill>/scripts/` e `.claude/skills/<skill>/hooks/`) ou num arquivo de aceite (`docs/tickets/<issue>/<ticket>/aceite.md`). Mudança só em documento fora desses caminhos não invalida, e uma branch que só altera esse tipo de documento não precisa de aprovação. O `AGENTS.md` de um projeto fica em `apps/`, então alterá-lo invalida.
- **Não contorne o bloqueio.** Se um push sem verificação for mesmo necessário, como o de um trabalho pela metade, peça ao usuário, que o faz no terminal.

**Aceite no pull request**

Todo pull request que altera código em `apps/` traz, no corpo, a seção `## Aceite`, que diz qual arquivo de aceite o PR cumpre:

```markdown
## Aceite

docs/tickets/<issue>/<ticket>/aceite.md
```

- **Com ticket:** o caminho do arquivo de aceite do ticket, criado pelo commit de plano: `docs/tickets/<issue>/<ticket>/aceite.md`. Os critérios e os testes não se repetem no PR.
- **Sem aceite novo:** escreva `nenhum` seguido do motivo, como "nenhum: refatoração sem mudança de comportamento". Vale para refatoração, mudança no harness e documento.
- **O que a CI confere,** em todos os arquivos de aceite de `docs/tickets/` e não só no do ticket: todo critério com marca de teste tem ao menos um teste com o ID numa tag, ou ligado a ele por uma linha do mapa de testes do ticket, que rodou e passou; o teste que ainda traz o ID no título e não tem tag reprova; nenhum teste cita um ID que não está num arquivo de aceite; nenhum teste com ID foi pulado; o arquivo citado existe. Critério com marca de revisão humana ou de documento não exige teste.
- **Critério sem teste:** escreva o teste, com o ID numa tag (formato em `.claude/skills/plan-ticket/formatos/aceite.md`, seção "Teste de aceite"). Não cite um teste que não tenha relação com o critério: a CI só prova que ele existe e passou, e quem julga se ele prova o critério é o revisor.

O aceite é conferido na máquina antes do push, como descrito em "Antes do push".

**Revisão de conformidade**

Quem escreveu o código não é quem o confere. Toda mudança que altera o código que pede revisão (o valor de mesmo nome da lista "Valores das skills do ticket": o código em `apps/` e, em ticket com aceite, o harness) passa pelo subagente `revisor-conformidade`, que não viu a implementação e confere se ela entrega o que foi planejado: o aceite, os testes contra os cenários, o contrato e o schema contra o commit de plano e os documentos donos. O que ele confere está no `REVIEW.md` da raiz, que o Copilot e o Claude Code Review também leem no PR. Os defeitos gerais de código ficam com a `/code-review`, e uma revisão feita na mesma sessão que escreveu o código não substitui esta.

No fluxo do ticket, ela vem depois do `/worktree sincronizar`, da `/simplify` e da `/code-review`, e antes do `full`, para as revisões verem o resultado do merge e as correções entrarem na única verificação completa: implementação, commit, `/worktree sincronizar`, `/simplify`, `/code-review`, revisão de conformidade, correções, `full` e push. A revisão não é um gate mecânico: não impede o `full` nem o PR, todo achado, corrigido ou não, vai para um comentário no PR, e a decisão sobre o que ficou sem corrigir é do usuário no merge. A exceção é o achado de severidade alta que o agente não corrigiria: ele pergunta ao usuário antes de seguir. Como preparar a revisão, chamar o subagente, tratar os achados e publicar o comentário está na skill `revisao-conformidade`.

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
3. **Tickets:** sub-issues da spec. Cada ticket é uma fatia vertical, que atravessa banco, API, interface e testes e pode ser verificada sozinha. Tickets de preparação (ambiente, base de componentes) são a exceção e vêm primeiro. Um ticket de acabamento de uma spec já concluída também nasce como sub-issue dela: não há ticket sem pai.
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
- Mova a issue para "In Progress" ao começar o planejamento: a `/plan-ticket` faz isso, e a `/implement` confere. Ela só é concluída quando todos os critérios de aceite e a [definição de pronto](#definição-de-pronto) passam.
- **O "Done" vem do merge.** A integração do Linear com o GitHub vincula o PR à issue pelo identificador na branch ou no título, marca "In Review" quando o PR abre e "Done" no merge: "concluído" significa "está na `main`". O PR só abre com o `full` aprovado, então abrir já é esperar a revisão do usuário; um PR em rascunho só existe se o usuário o abrir à mão (o hook de push exige o `full` aprovado antes de qualquer push), e então a issue fica em "In Progress". O vínculo depende de o app do Linear ter acesso ao repositório do PR; um PR sem arquivo alterado não entra, porque a Guarda do harness o reprova. Os tickets sem PR, como os de design, ficam com o "Done" manual.
- Não feche nem edite a spec pai ao concluir um ticket.
- Se a implementação mudar uma decisão, atualize o documento dono dela (o LLD ou o `AGENTS.md` do projeto) e o ticket na mesma tarefa. O ID e a marca de um critério nunca mudam; o texto dele só é corrigido, se ficou factualmente desatualizado, com a aprovação do usuário no plano.
- **Pare e pergunte** diante de uma decisão que não está no ticket nem no plano e que outro ticket em andamento também tomaria, ou diante de mudar algo que outro ticket em andamento usa. Decidir sozinho é como dois tickets paralelos passam nos próprios testes e quebram na integração. As decisões que o ticket consome de outros, e o dono de cada uma, estão na seção "Decisões de outros tickets" dele.

### Plano do ticket

Cada ticket é planejado no início dele, e não na criação dos tickets, e só então implementado.

1. **Planejar:** rode a `/plan-ticket` com o identificador do ticket. Ela escreve o plano e para, sem commit.
2. **Aprovar pela página:** a `/plan-ticket` para com a mensagem proposta do commit de plano e a página de revisão do plano, que traz também a visão legível do contrato e do schema, sem versionar nenhuma das duas; o usuário lê a página e responde no chat, e só depois da aprovação vem o commit de plano, com essa mensagem. O passo a passo e as abas da página estão na skill.
3. **Implementar:** numa sessão nova, a partir do commit de plano e do arquivo de aceite, com a skill `tdd`. Os seams e a lista de testes já vêm do plano. Num ticket sem critério de teste, como o de design, não há `tdd`: cada critério é entregue como o cenário dele descreve, e a definição de pronto só vale se o ticket alterar código.

**Os formatos são da skill.** A skill de plano, em `.claude/skills/plan-ticket/`, é a dona dos formatos do plano: o ID e a marca do critério, o arquivo de aceite e a tag do ID no teste (`formatos/aceite.md`), a mensagem do commit de plano (`formatos/mensagem.md`) e o contrato de rota e de tabela, com a saída do comando do contrato (`formatos/contrato.md`). Siga-os; aqui fica só o que é deste projeto.

**Valores das skills do ticket**

Uma lista só para o kit: cada skill lê as entradas dela no passo 0, e o valor que não está aqui vale o padrão que a skill diz. Os valores da `/plan-ticket`:

- **Pasta dos tickets:** `docs/tickets`. O Git versiona nela só o arquivo de aceite e o mapa de testes de cada pasta de ticket. O hook de congelamento recebe esta pasta na linha de comando dele, no `.claude/settings.json`.
- **Pasta dos documentos:** `docs`.
- **Comando do Node:** `.claude/skills/ambiente/scripts/node-in-api.sh`, que roda o Node no contêiner `api`, sobre o repositório montado em `/repo`, porque a máquina não roda `node`.
- **Comando do contrato:** `.claude/skills/contrato/scripts/contract-view.sh`, a visão legível do contrato e do schema entre dois pontos do Git.
- **Arquivos do contrato:** `apps/api/openapi.json apps/api/prisma/schema.prisma`.

Os valores da `/revisao-conformidade`:

- **Pasta dos tickets:** a mesma da `/plan-ticket`, `docs/tickets`.
- **Base:** a `HARNESS_BASE_REF`, com `origin/main` por padrão (`.claude/skills/worktree/scripts/harness-base.sh`). O script dos insumos, `.claude/skills/revisao-conformidade/scripts/review-inputs.sh`, não lê a variável: passe `--base "${HARNESS_BASE_REF:-origin/main}"`.
- **Código que pede revisão:** toda mudança no código em `apps/`, com ou sem ticket, e a mudança no harness (`.claude/hooks/`, `.github/`, os scripts e os hooks das skills) de um ticket com aceite. Uma mudança só de documento não pede revisão.
- **Revisor:** `revisor-conformidade`, instalado em `.claude/agents/revisor-conformidade.md`: a cópia do modelo da skill (`revisor.md`) com o cabeçalho do agente e a ferramenta do Linear. Um teste confere que a cópia é o modelo.
- **Desvio do contrato:** `.claude/skills/contrato/scripts/contract-drift.sh`, que mostra o desvio do snapshot e do schema desde o commit de plano e só avisa (a entrada e a saída estão no cabeçalho). É também o que o aviso do modo completo da verificação chama.

Os valores do `/worktree`:

- **Base:** a mesma da `/revisao-conformidade`: a `HARNESS_BASE_REF`, com `origin/main` por padrão (`.claude/skills/worktree/scripts/harness-base.sh`).
- **Comando das frentes:** `.claude/skills/ambiente/scripts/frentes.sh`, o atalho que chama o núcleo com o limite, o ambiente por slot da frente e os pontos de convergência deste projeto.
- **Limite de frentes:** 3. A variável `FRENTES_LIMITE` o ajusta, pelo atalho.
- **Arquivo dos pontos de convergência:** `.claude/skills/ambiente/pontos-de-convergencia.txt`.
- **Pasta dos tickets:** a mesma da `/plan-ticket`, `docs/tickets`.
- **Status e tipo da branch:** os padrões da skill ("In Progress", "In Review" e "Done"; `bugfix` para a label `Bug`, `feature` para o resto).
- **Atualizar o ambiente, recriar o banco, gerar uma migração, subir as aplicações e regenerar o gerado:** os comandos da seção "Commands the sync uses" da `/ambiente` (`.claude/skills/ambiente/SKILL.md`). O único arquivo gerado é `apps/api/openapi.json`.
- **Verificação completa:** `.claude/skills/verificar/scripts/verify.sh full`, em segundo plano. Se a branch altera `apps/`, ele recebe o corpo do pull request, com a seção `## Aceite`, em `ACCEPTANCE_BODY_FILE=<arquivo>`.

Os valores da `/implement`:

- **Pasta dos tickets:** a mesma da `/plan-ticket`, `docs/tickets`.
- **Código que pede revisão:** o da `/revisao-conformidade`, acima.
- **Verificação completa:** a dos valores do `/worktree`, acima.

Os valores da `/proteger-harness`:

- **Lista de arquivos protegidos:** `.claude/skills/verificar/arquivos-protegidos.txt`, que o workflow da Guarda do harness passa à Guarda.
- **Frase de destravar do hook do estado:** a frase do `--ajuda` na linha de comando do hook, no `.claude/settings.json`, igual à `FULL_LOCK_ASK` do script da trava (um teste confere).

O atalho `.claude/skills/verificar/scripts/verify.sh plan <issue> <ticket> [<commit de plano>]` chama o script da página da skill com esses valores (a `<issue>` é a issue pai do ticket, que vai no `--pai` do script); use-o nos passos de parada e de commit da skill.

**Neste projeto**

- **Desenho:** o contrato de rotas vai direto para o `apps/api/openapi.json`, e o schema das tabelas implementadas, para o `schema.prisma`: são os donos deles, conferidos por máquina. Como cada item do formato de rota e de tabela da skill se escreve neles está no `docs/lld.md` (seção 3, "Formato de uma rota no snapshot", e seção 2, "Formato de uma tabela no schema"). O LLD fica com as convenções, as regras e o que ainda não existe. A lista de arquivos e interfaces e a mudança de dados (seed, backfill) ficam na mensagem do commit de plano, como diz a skill em `formatos/mensagem.md`.
- **Congelamento:** o agente não altera um arquivo de aceite já em commit. Um hook da skill de plano (`.claude/skills/plan-ticket/hooks/freeze-acceptance.sh`) nega a edição pelo agente, e a guarda do harness avisa no PR quando um aceite existente muda. O mapa de testes do ticket não é congelado.
- **Cobertura:** a CI confere o ID na tag do teste, como descrito em "Aceite no pull request". O ID vai na tag, e não no título, porque os dois relatórios JSON, o do Vitest e o do Playwright, trazem as tags de cada teste. O `strictTags` do Vitest fica desligado nas configs da API e da web, porque quem valida o ID é o conferidor: um ID que não está em nenhum arquivo de aceite reprova. Um teste de skill de uso geral não leva o ID de um critério deste projeto: a ligação dele com o critério vai para o mapa de testes do ticket (`mapa-de-testes.txt` na pasta do ticket, formato em `formatos/mapa-de-testes.md` da skill de plano). Os testes em shell do harness também provam critério: como nomear o caso e onde fica o relatório está no cabeçalho de `.claude/skills/verificar/scripts/test/sh-helpers.sh`.

## Skills do ticket

O fluxo do ticket roda sobre um kit de skills em `.claude/skills/`, em duas partes:

- **Skills genéricas**, que servem a qualquer projeto: `/plan-ticket`, `/revisao-conformidade`, `/worktree`, `/proteger-harness`, `/implement` e `tdd`. Elas nomeiam papéis, e não comandos, e não citam dado deste projeto.
- **Skills do projeto**, que guardam o que depende da stack daqui: `/verificar`, `/ambiente` (o Docker Compose, o Node no contêiner e os pontos de convergência) e `/contrato` (a visão e o desvio do contrato), e as que nascem nos próximos tickets da LUI-193.

**A dependência vai do projeto para a genérica, e nunca o contrário.** O projeto pode carregar e chamar arquivo de uma skill genérica. Uma skill genérica não carrega arquivo do projeto nem de outra genérica; chamar outra skill pelo nome, como a `/implement` chama a `tdd`, não conta como dependência.

**Onde mora o mecanismo.** Script, hook e teste de um mecanismo moram dentro da skill do domínio dele, com os testes ao lado dos scripts (`<skill>/scripts/test/` e `<skill>/hooks/test/`). A verificação completa acha e roda os testes de todas as skills sem lista à mão.

**Se ninguém invocar a skill, nada quebra.** As regras e os comandos de entrada ficam neste arquivo, e uma skill só dá o passo a passo; o que não pode falhar é imposto por hook ou pela cadeia de skills (a `/implement` chama a `tdd`, o `/worktree sincronizar`, a revisão e a verificação), e não pela lembrança de invocar uma skill.

**Genericidade.** A suíte `.claude/skills/verificar/scripts/genericity.sh` reprova uma skill genérica que traga um padrão deste projeto ou carregue arquivo de outra skill. A lista dela, `.claude/skills/verificar/genericidade.txt` (as skills genéricas e os padrões), é protegida, e a suíte roda na verificação completa pelo teste dela.

**Proteção.** O texto de uma skill (o `SKILL.md`, os formatos, o modelo do revisor) é livre: este arquivo vale mais que qualquer skill, e as regras e os comandos de entrada ficam aqui. O mecanismo de uma skill, ou seja, os scripts e os hooks dela, é protegido, e a lista de arquivos protegidos é a da skill `/verificar` (`.claude/skills/verificar/arquivos-protegidos.txt`), que a Guarda do harness lê.

## Convenções de Git

- **Branch principal:** `main`. Nunca faça commit direto nela.
- **Branches de trabalho:** `feature/*`, `bugfix/*`, `hotfix/*` e `docs/*`, criadas a partir da `main` e integradas por pull request.
- **Commits:** mensagens curtas e descritivas, focadas no porquê da mudança.
- **Merge:** o merge é decisão do usuário. O agente só o faz quando o usuário autoriza expressamente aquele PR ou aquela tarefa, e só com o `Veredito` e a `Guarda do harness` verdes. Um PR de harness, que a Guarda reprova, só entra por override do usuário, que o faz no prompt. Sem autorização expressa, o agente não faz o merge, e uma negação do `gh pr merge` não se contorna por outro caminho.
- **O que o merge pede:** o ruleset da `main` exige o check `Veredito` verde, o check `Guarda do harness` (que o usuário contorna como admin nos PRs de harness) e o PR atualizado com a `main` antes do merge, que o `/worktree sincronizar` traz. A cópia declarativa do ruleset é o `.github/rulesets/main.json`, e quem o aplica no GitHub é o usuário.
- **Arquivos do harness:** os que a lista de arquivos protegidos marca como bloqueados (`.claude/skills/verificar/arquivos-protegidos.txt`, lida pela Guarda): `.github/`, `.claude/settings.json`, `.claude/hooks/`, `.claude/agents/`, os scripts e os hooks de qualquer skill e a própria lista só mudam quando a tarefa é sobre o harness. Um pull request que os altera é reprovado pelo check `Guarda do harness` e só entra por override do usuário. Avise isso ao abrir o PR. O texto das skills não é arquivo de harness, de propósito: este arquivo vale mais que qualquer uma delas, e a regra do merge mora aqui, então enfraquecer o texto de uma skill não libera nada.

## Consulta à documentação de bibliotecas

Quando precisar consultar a documentação de uma biblioteca, use o context7 para buscar informações atualizadas e precisas.

## Agent Skill Usage


Quando estiver trabalhando em uma tarefa, primeiro decomponha a solicitação em suas subtarefas e preocupações subjacentes, depois identifique quais skills disponíveis correspondem a alguma delas e ative essas skills.

Quando uma skill diverge deste arquivo, do `AGENTS.md` do projeto ou dos documentos de `docs/`, valem estes.