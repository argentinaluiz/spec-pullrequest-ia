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

A tabela é a do slot 0, o de um checkout sem `.env` na raiz. As portas e os endereços dos outros slots estão no `docs/lld.md`, seção 6, "Ambiente local por slot".

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

**Recomeçar do zero.** Para apagar os dados e recriar o banco:

```bash
docker compose -f compose.dev.yaml down -v
```

O `-v` apaga o volume do banco: na próxima subida, o banco é recriado e as migrações rodam de novo. Para gerar também um `.env` e chaves novos, apague o `apps/api/.env` antes de subir. Depois, suba o ambiente como em "Subir e derrubar".

**A API não sobe.** Se o `up --wait` termina com erro, veja a causa com:

```bash
docker compose -f compose.dev.yaml logs api
```

Quando o preparo da API falha (uma migração quebrada, um `.env` incompleto), o contêiner `api` sai e o `exec` deixa de funcionar nele. Para consertar, rode o comando num contêiner avulso, que não passa pelo preparo:

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

Cada ticket pode correr numa **frente**: um checkout próprio, na branch do ticket, com a própria sessão do agente, o próprio ambiente Docker e o próprio PR. A primeira frente pode ser o checkout principal, no slot 0, com as portas da tabela de "Execução no Docker". As outras são worktrees em pastas irmãs, abertas com `cd` e o Claude Code, cada uma com um slot que dá a ela um bloco próprio de portas. O limite de frentes ao todo está em `.config/project` (`frentes.limite`).

O principal conta como frente quando não está na `main`, e o HEAD solto também conta, porque não é estado de repouso. Em repouso, ele fica na `main`, atualizada com `git merge --ff-only <base>`. Para trabalhar nele, crie a branch do ticket a partir da base (`git switch -c feature/<ticket> <base>`), e ele vira a primeira frente.

Tudo o que diz respeito às frentes passa pelo `/worktree`. Os modos `novo`, `listar` e `remover` também rodam no terminal, pelo núcleo, `.claude/skills/worktree/scripts/frentes.sh <modo>`. O `--forcar` do `remover` abandona um ticket sem merge e é só do usuário: o agente não o usa, e um hook o nega. Depois que o usuário mergeia o PR, o agente só roda o `remover` se ele pedir.

As regras de cada comando estão no cabeçalho do núcleo; o `.env` do slot, as portas e o Compose, no do `scripts/frente-ambiente.sh`; o contrato das variáveis do `.env`, na LLD. O script não fala com o Linear: mover a issue para "In Progress" é da sessão do ticket.

**Navegador:** os MCPs de navegador do projeto abrem um perfil isolado por instância (`--isolated` no `.mcp.json`), então duas sessões validam telas ao mesmo tempo, e o login feito num deles não persiste para a próxima sessão. No navegador do usuário, abra cada slot num perfil diferente (o porquê está em `docs/lld.md`, seção 6, "Ambiente local por slot").

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

1. O `verify.sh full` aprova. Ele é a definição de "passou": tipos, lint, todas as suítes, o build da web, o aceite e os segredos. O que cada passo confere está no cabeçalho do script.
2. Em mudança de interface, a validação visual descrita em `docs/design-system.md` foi feita. É a única exigência que o script não confere.

Rode o script da raiz do repositório, na máquina (ele mesmo chama os contêineres), com a web e a API no ar:

```bash
.claude/skills/verificar/scripts/verify.sh full
```

- **Durante o desenvolvimento, só os testes do que mudou.** Rode os testes ligados aos arquivos alterados, com os comandos do `AGENTS.md` do projeto. O hook de fim de turno já confere os tipos e o lint, com o `verify.sh fast`.
- **O `full` roda uma vez, no fim da tarefa,** depois das revisões (a ordem está em "Revisão de conformidade"). Quem o roda é quem fecha a tarefa: no fluxo de ticket, a sessão do ticket, na frente, e nunca um subagente. Quem recebeu a tarefa de outro agente (implementar, corrigir achados, revisar) termina com os testes do que mudou e devolve o resultado, dizendo o que rodou. Uma nova sincronização com a `main`, quando o PR fica velho, pede outro `full`.
- **Rode o `full` em segundo plano.** Com vários checkouts na máquina, ele espera a vez dos outros (o cabeçalho do `verify.sh` descreve o semáforo), e a espera somada ao `full` pode passar do limite de um comando.
- **Falha se corrige na causa, na mesma tarefa.** Erro de tipo, de lint ou de teste nunca fica como dívida para uma tarefa futura. Depois de uma reprovação, rode o `full` de novo só depois de corrigir a causa.
- **Na terceira reprovação seguida nos mesmos passos, o `full` trava.** Pare e peça ao usuário que examine a falha e rode `! .claude/skills/verificar/scripts/verify.sh unlock`; só ele destrava. Não rode o `verify.sh` com `CI=` nem `GITHUB_ACTIONS=`, que desligariam a trava.
- **O veredito é o da CI.** Ela roda esse mesmo comando em todo pull request, então passar na máquina é condição para abrir o PR, e não prova de que a mudança está pronta. Depois de duas reprovações da CI no mesmo PR, pare e avise o usuário, em vez de tentar a terceira correção.
- **Não contorne uma verificação.** Não pule teste (`.skip`, `.only`, `.todo`, `.fixme`), não apague teste que falha e não altere o script nem o workflow para fazer a mudança passar. A CI reprova teste pulado e suíte vazia.

**Antes do push**

Um hook confere todo `git push` que você faz e o nega em dois casos: quando os commits da branch trazem um segredo, e quando o modo completo não aprovou o conteúdo do último commit. A aprovação vale para o que foi verificado, e o push envia o que está em commit, então faça o commit de tudo antes do `full`. Em branch que altera código em `apps/`, salve o corpo do pull request num arquivo, com a seção `## Aceite`, e rode o `full` com `ACCEPTANCE_BODY_FILE=<arquivo>` na frente; sem a variável, o `full` registra o aceite como pulado e o hook recusa a aprovação.

- **O que invalida a aprovação:** uma mudança no código verificado: `apps/`, o `compose.dev.yaml`, os scripts e os hooks do harness e os arquivos de aceite. A lista exata é a `VERIFIED_PATHS` do `verify.sh`. Mudança só em documento fora desses caminhos não invalida, e uma branch que só altera esse tipo de documento não precisa de aprovação. O `AGENTS.md` de um projeto fica em `apps/`, então alterá-lo invalida.
- **Não contorne o bloqueio.** Se um push sem verificação for mesmo necessário, como o de um trabalho pela metade, peça ao usuário, que o faz no terminal.

**Aceite no pull request**

Todo pull request que altera código em `apps/` traz, no corpo, a seção `## Aceite`, com uma destas duas linhas:

- **Com ticket:** o caminho do arquivo de aceite do ticket, criado pelo commit de plano: `docs/tickets/<issue>/<ticket>/aceite.md`.
- **Sem aceite novo:** `nenhum` seguido do motivo, como "nenhum: refatoração sem mudança de comportamento". Vale para refatoração, mudança no harness e documento.

A CI confere, em todos os arquivos de aceite de `docs/tickets/` e não só no do ticket, que todo critério com marca de teste tem um teste com o ID numa tag (ou ligado a ele pelo mapa de testes do ticket) que rodou e passou, e que nenhum teste cita um ID inexistente ou foi pulado. Critério com marca de revisão humana ou de documento não exige teste. O resto está no cabeçalho do `check-acceptance.cjs`.

**Critério sem teste:** escreva o teste, com o ID numa tag (formato em `.claude/skills/plan-ticket/formatos/aceite.md`, seção "Teste de aceite"). Não cite um teste que não tenha relação com o critério: a CI só prova que ele existe e passou, e quem julga se ele prova o critério é o revisor.

**Revisão de conformidade**

Quem escreveu o código não é quem o confere. Toda mudança que altera o "Código que pede revisão" (valor da lista "Valores das skills do ticket") passa pelo subagente `revisor-conformidade`, que não viu a implementação e confere se ela entrega o que foi planejado. O que ele confere está no `REVIEW.md` da raiz, que o Copilot e o Claude Code Review também leem no PR. Os defeitos gerais de código ficam com a `/code-review`, e uma revisão feita na mesma sessão que escreveu o código não substitui esta.

No fluxo do ticket, a ordem é: implementação, commit, `/worktree sincronizar`, `/simplify`, `/code-review`, revisão de conformidade, correções, `full` e push. A revisão vem depois da sincronização e das outras revisões para ver o resultado do merge, e antes do `full` para as correções entrarem na única verificação completa. Ela não é um gate mecânico: não impede o `full` nem o PR, todo achado, corrigido ou não, vai para um comentário no PR, e a decisão sobre o que ficou sem corrigir é do usuário no merge. A exceção é o achado de severidade alta que o agente não corrigiria: ele pergunta ao usuário antes de seguir. O passo a passo está na skill `revisao-conformidade`.

## Issues e tickets no Linear

O Linear é o gerenciador de issues do projeto, acessado pelo servidor MCP `linear-server`. Specs e tickets vivem lá, e não em arquivos do repositório.

- **Time:** Luiz Carlos (`LUI`).
- **Projeto:** gerenciador de arquivos.
- **Labels de tipo:** `Feature`, `Bug` e `Improvement`.
- **Label de triagem:** `ready-for-agent`, para a issue já especificada, que um agente pode pegar sem triagem adicional. A spec e os tickets levam essa label e uma de tipo.

**Da funcionalidade ao ticket**

1. **Planejamento:** as decisões são fechadas com o usuário e registradas no documento dono delas (ver "Onde cada informação mora"), antes da spec.
2. **Spec:** uma issue por funcionalidade, com o problema, a solução, as histórias de usuário, as decisões de implementação e de teste e o que fica fora de escopo.
3. **Tickets:** sub-issues da spec. Cada ticket é uma fatia vertical, que atravessa banco, API, interface e testes e pode ser verificada sozinha. Tickets de preparação (ambiente, base de componentes) são a exceção e vêm primeiro. Um ticket de acabamento de uma spec já concluída também nasce como sub-issue dela: não há ticket sem pai.
4. **Bloqueios:** as dependências entre tickets são a relação nativa do Linear ("blocked by"), e não texto na descrição.

**Regras de escrita**

- Specs e tickets são escritos em português, com o vocabulário do `GLOSSARY.md`.
- Não cite caminhos de arquivo nem trechos de código: eles envelhecem rápido. Cite documentos e módulos pelo nome.
- Todo ticket traz critérios de aceite verificáveis. Cada critério leva um ID `CA<n>` e uma marca de conferência, como descrito em [Plano do ticket](#plano-do-ticket).

**Ao trabalhar em um ticket**

- Pegue só tickets cujos bloqueios já foram concluídos.
- Leia o ticket e a spec pai antes de começar. O contrato e as regras completas estão no LLD.
- Use o identificador da issue no nome da branch.
- Mova a issue para "In Progress" ao começar o planejamento. Ela só é concluída quando todos os critérios de aceite e a [definição de pronto](#definição-de-pronto) passam.
- **O "Done" vem do merge.** A integração do Linear com o GitHub vincula o PR à issue pelo identificador na branch ou no título, marca "In Review" quando o PR abre e "Done" no merge: "concluído" significa "está na `main`". Um PR em rascunho, que só o usuário abre à mão, deixa a issue em "In Progress". Os tickets sem PR, como os de design, ficam com o "Done" manual.
- Não feche nem edite a spec pai ao concluir um ticket.
- Se a implementação mudar uma decisão, atualize o documento dono dela (o LLD ou o `AGENTS.md` do projeto) e o ticket na mesma tarefa. O ID e a marca de um critério nunca mudam; o texto dele só é corrigido, se ficou factualmente desatualizado, com a aprovação do usuário no plano.
- **Pare e pergunte** diante de uma decisão que não está no ticket nem no plano e que outro ticket em andamento também tomaria, ou diante de mudar algo que outro ticket em andamento usa. Decidir sozinho é como dois tickets paralelos passam nos próprios testes e quebram na integração. As decisões que o ticket consome de outros, e o dono de cada uma, estão na seção "Decisões de outros tickets" dele.

### Plano do ticket

Cada ticket é planejado no início dele, e não na criação dos tickets, e só então implementado.

1. **Planejar:** rode a `/plan-ticket` com o identificador do ticket. Ela escreve o plano e para, sem commit: o commit de plano só vem depois que o usuário aprova a página de revisão que ela apresenta. O passo a passo está na skill.
2. **Implementar:** numa sessão nova, a partir do commit de plano e do arquivo de aceite, com a skill `tdd`. Os seams e a lista de testes já vêm do plano. Num ticket sem critério de teste, como o de design, não há `tdd`: cada critério é entregue como o cenário dele descreve, e a definição de pronto só vale se o ticket alterar código.

**Os formatos são da skill.** Os do plano (o critério, o arquivo de aceite, a tag do ID no teste, a mensagem do commit de plano e o contrato de rota e de tabela) estão em `.claude/skills/plan-ticket/formatos/`. Siga-os; aqui fica só o que é deste projeto.

**Valores das skills do ticket**

Uma lista só para o kit: cada skill lê as entradas dela no passo 0, e o valor que não está aqui vale o padrão que a skill diz. Os valores da `/plan-ticket`:

- **Pasta dos tickets:** `docs/tickets`. O Git versiona nela só o arquivo de aceite e o mapa de testes de cada pasta de ticket. O hook de congelamento recebe esta pasta na linha de comando dele, no `.claude/settings.json`.
- **Pasta dos documentos:** `docs`.
- **Comando do Node:** `scripts/node-in-api.sh`, que roda o Node no contêiner `api`, sobre o repositório montado em `/repo`, porque a máquina não roda `node`.
- **Comando do contrato:** `scripts/contract-view.sh`, a visão legível do contrato e do schema entre dois pontos do Git.
- **Arquivos do contrato:** `apps/api/openapi.json apps/api/prisma/schema.prisma`.

Os valores da `/revisao-conformidade`:

- **Base:** a `HARNESS_BASE_REF`, com `origin/main` por padrão (`.claude/skills/worktree/scripts/harness-base.sh`). O script dos insumos, `.claude/skills/revisao-conformidade/scripts/review-inputs.sh`, não lê a variável: passe `--base "${HARNESS_BASE_REF:-origin/main}"`.
- **Código que pede revisão:** toda mudança no código em `apps/`, com ou sem ticket, e a mudança no harness (`.claude/hooks/`, `.github/`, `.config/`, a pasta `scripts/` da raiz, os scripts e os hooks das skills) de um ticket com aceite. Uma mudança só de documento não pede revisão.
- **Revisor:** `revisor-conformidade`, instalado em `.claude/agents/revisor-conformidade.md`: a cópia do modelo da skill (`revisor.md`) com o cabeçalho do agente e a ferramenta do Linear. Um teste confere que a cópia é o modelo.
- **Desvio do contrato:** `scripts/contract-drift.sh`, que mostra o desvio do snapshot e do schema desde o commit de plano e só avisa (a entrada e a saída estão no cabeçalho). É também o que o aviso do modo completo da verificação chama.

Os valores do `/worktree` moram em `.config/project`, e não nesta lista (ver "Configuração do projeto", em "Skills do ticket"). A base é a mesma da `/revisao-conformidade`; os status do Linear, o tipo da branch e a pasta dos tickets valem o padrão da skill.

Os valores da `/implement`:

- **Código que pede revisão:** o da `/revisao-conformidade`, acima.
- **Verificação completa:** a chave `verificacao.completa` do `.config/project`.

Os valores da `/proteger-harness`:

- **Lista de arquivos protegidos:** `.claude/skills/verificar/arquivos-protegidos.txt`, que o workflow da Guarda do harness passa à Guarda.
- **Frase de destravar do hook do estado:** a frase do `--ajuda` na linha de comando do hook, no `.claude/settings.json`, igual à `FULL_LOCK_ASK` do script da trava (um teste confere).

O atalho `.claude/skills/verificar/scripts/verify.sh plan <issue> <ticket> [<commit de plano>]` chama o script da página da skill com esses valores.

**Neste projeto**

- **Desenho:** o contrato de rotas vai direto para o `apps/api/openapi.json`, e o schema das tabelas implementadas, para o `schema.prisma`: são os donos deles, conferidos por máquina. Como cada item do formato de rota e de tabela da skill se escreve neles está no `docs/lld.md` (seção 3, "Formato de uma rota no snapshot", e seção 2, "Formato de uma tabela no schema"). O LLD fica com as convenções, as regras e o que ainda não existe.
- **Congelamento:** o agente não altera um arquivo de aceite já em commit. Um hook da skill de plano (`.claude/skills/plan-ticket/hooks/freeze-acceptance.sh`) nega a edição pelo agente, e a guarda do harness avisa no PR quando um aceite existente muda. O mapa de testes do ticket não é congelado.
- **Cobertura:** a CI confere o ID na tag do teste, como descrito em "Aceite no pull request". O ID vai na tag, e não no título, porque os relatórios JSON do Vitest e do Playwright trazem as tags de cada teste; o `strictTags` do Vitest fica desligado nas configs da API e da web, porque quem valida o ID é o conferidor. Um teste de skill de uso geral não leva o ID de um critério deste projeto: a ligação dele com o critério vai para o mapa de testes do ticket, como diz a `/plan-ticket`. Os testes em shell do harness também provam critério; como nomear o caso está no cabeçalho de `.claude/skills/verificar/scripts/test/sh-helpers.sh`.

## Skills do ticket

O fluxo do ticket roda sobre um kit de skills em `.claude/skills/`, em duas partes:

- **Skills genéricas**, que servem a qualquer projeto: `/plan-ticket`, `/revisao-conformidade`, `/worktree`, `/proteger-harness`, `/implement` e `tdd`. Elas nomeiam papéis, e não comandos, e não citam dado deste projeto.
- **Skills do projeto**, que guardam o que depende da stack daqui: a `/verificar`.

**A dependência vai do projeto para a genérica, e nunca o contrário.** O projeto pode carregar e chamar arquivo de uma skill genérica. Uma skill genérica não carrega arquivo do projeto nem de outra genérica; chamar outra skill pelo nome, como a `/implement` chama a `tdd`, não conta como dependência.

**Configuração do projeto.** O que uma skill genérica precisa saber deste projeto (limites, comandos, classificações) mora no `.config/project`, um arquivo só, na pasta `.config/` da raiz, com uma seção por assunto, na sintaxe do `git config`, que o script ou o agente lê com `git config --file`. Cada skill lê as seções de que precisa, e o cabeçalho do arquivo diz quem lê o quê. Um valor mora nesse arquivo quando ele o declara e, senão, na lista "Valores das skills do ticket", acima. O arquivo nomeia comandos que as skills executam, então a lista de arquivos protegidos o bloqueia.

**Onde mora o mecanismo.** Script, hook e teste de um mecanismo moram dentro da skill do domínio dele, com os testes ao lado dos scripts (`<skill>/scripts/test/` e `<skill>/hooks/test/`). Um domínio só tem skill quando o agente segue um procedimento nela (o `SKILL.md`), ou quando ela é genérica, do kit, e vai ser copiada para outros projetos; um procedimento raro fica neste arquivo. Os scripts de um domínio sem skill moram na pasta `scripts/` da raiz, com os testes em `scripts/test/`. A verificação completa acha e roda os testes de todas as skills e os da `scripts/` da raiz sem lista à mão.

**Se ninguém invocar a skill, nada quebra.** As regras e os comandos de entrada ficam neste arquivo, e uma skill só dá o passo a passo; o que não pode falhar é imposto por hook ou pela cadeia de skills (a `/implement` chama a `tdd`, o `/worktree sincronizar`, a revisão e a verificação), e não pela lembrança de invocar uma skill.

**Genericidade.** O que a suíte `.claude/skills/verificar/scripts/genericity.sh` reprova está no cabeçalho dela. Ela roda na verificação completa.

**Proteção.** O texto de uma skill (o `SKILL.md`, os formatos, o modelo do revisor) é livre: este arquivo vale mais que qualquer skill, e as regras e os comandos de entrada ficam aqui. O mecanismo dela, ou seja, os scripts e os hooks, é protegido (ver "Arquivos do harness", em "Convenções de Git").

## Convenções de Git

- **Branch principal:** `main`. Nunca faça commit direto nela.
- **Branches de trabalho:** `feature/*`, `bugfix/*`, `hotfix/*` e `docs/*`, criadas a partir da `main` e integradas por pull request.
- **Commits:** mensagens curtas e descritivas, focadas no porquê da mudança.
- **Merge:** o merge é decisão do usuário. O agente só o faz quando o usuário autoriza expressamente aquele PR ou aquela tarefa, e só com o `Veredito` e a `Guarda do harness` verdes. Um PR de harness, que a Guarda reprova, só entra por override do usuário, que o faz no prompt. Sem autorização expressa, o agente não faz o merge, e uma negação do `gh pr merge` não se contorna por outro caminho.
- **O que o merge pede:** o ruleset da `main` exige o check `Veredito` verde, o check `Guarda do harness` (que o usuário contorna como admin nos PRs de harness) e o PR atualizado com a `main` antes do merge, que o `/worktree sincronizar` traz. A cópia declarativa do ruleset é o `.github/rulesets/main.json`, e quem o aplica no GitHub é o usuário.
- **Arquivos do harness:** os que a lista de arquivos protegidos marca como bloqueados (`.claude/skills/verificar/arquivos-protegidos.txt`, lida pela Guarda): `.github/`, `.claude/settings.json`, `.claude/hooks/`, `.claude/agents/`, `.config/`, os scripts e os hooks de qualquer skill, a pasta `scripts/` da raiz e a própria lista só mudam quando a tarefa é sobre o harness. Um pull request que os altera é reprovado pelo check `Guarda do harness` e só entra por override do usuário. Avise isso ao abrir o PR. O texto das skills não é arquivo de harness, de propósito: este arquivo vale mais que qualquer uma delas, e a regra do merge mora aqui, então enfraquecer o texto de uma skill não libera nada.

## Consulta à documentação de bibliotecas

Quando precisar consultar a documentação de uma biblioteca, use o context7 para buscar informações atualizadas e precisas.

## Agent Skill Usage


Quando estiver trabalhando em uma tarefa, primeiro decomponha a solicitação em suas subtarefas e preocupações subjacentes, depois identifique quais skills disponíveis correspondem a alguma delas e ative essas skills.

Quando uma skill diverge deste arquivo, do `AGENTS.md` do projeto ou dos documentos de `docs/`, valem estes.