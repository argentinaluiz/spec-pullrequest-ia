# Harness — verificação do trabalho dos agentes

Este documento é dono do desenho do harness: que controles existem, o que cada um decide, o que ficou de fora e por quê. As regras que o agente segue a cada tarefa ficam no `AGENTS.md` da raiz, que aponta para cá.

O projeto é uma referência didática que precisa funcionar de verdade. Por isso o harness tem poucas peças, cada uma demonstrável e com o motivo escrito. A origem das decisões é a pesquisa "Verificação e harness para agentes de código: pesquisa consolidada", de 12 de outubro de 2026. As etapas 7 e 8 vêm da pesquisa "Critérios de aceite, testes e contrato antes da implementação", de 14 de outubro de 2026.

## Estado

| Etapa | Peça | Estado |
| --- | --- | --- |
| 1 | Script de verificação e CI | Implementado |
| 2 | Proteção da `main` e guarda do harness | Implementado. O ruleset está aplicado no repositório de teste, e ainda não no repositório principal |
| 3 | Hook de fim de turno | Implementado |
| 4 | Aceite: seção do PR e cobertura dos critérios por ID | Implementado. Substitui a tabela de aceite |
| 5 | Revisor de conformidade | Implementado |
| 6 | Bloqueio no push | Implementado |
| 7 | Plano do ticket e aceite congelado | Em andamento. O processo, a cobertura por ID, as conferências do revisor, o congelamento do aceite (hook e guarda) e a página de revisão do plano estão implementados. Ver "Plano do ticket (planejado)" |
| 8 | Contrato e schema conferidos por máquina | Implementado. Ver "Etapa 8" |
| 9 | Trava das reprovações repetidas do modo completo | Implementado. Ver "Trava das reprovações repetidas" |

## Princípios

- **Quem faz não dá o veredito.** O agente declara que terminou, mas quem decide se passou é a CI, num ambiente que ele não controla.
- **Só fato computacional bloqueia.** Teste que falhou, relatório ausente e segredo nos commits são fatos, e reprovam. Julgamento, como o do revisor, só anota.
- **Evidência ausente reprova.** Suíte que não rodou, relatório que não foi gerado e contêiner fora do ar contam como falha, e não como sucesso.
- **Uma definição só de "passou".** O comando que o agente roda é o mesmo que a CI roda.
- **Toda falha diz como corrigir.** A mensagem traz o que falhou e o próximo passo.

## Política de severidade

| Achado | Efeito | Etapa |
| --- | --- | --- |
| Erro de tipos ou de lint | Bloqueia | 1 |
| Teste que falhou (inclusive na suíte de unidade da web) | Bloqueia | 1 |
| Suíte sem nenhum teste executado | Bloqueia | 1 |
| Teste pulado (`.skip`, `.only`, `.todo`, `.fixme`) | Bloqueia | 1 |
| Relatório de suíte ausente ou ilegível | Bloqueia | 1 |
| Build da web com erro | Bloqueia | 1 |
| Segredo nos commits da branch | Bloqueia | 1 |
| Teste no navegador que só passou na nova tentativa | Aviso no PR | 1 |
| PR que altera arquivo protegido do harness | Bloqueia | 2 |
| PR que altera configuração de lint ou de teste | Aviso no PR | 2 |
| Critério de aceite com marca de teste sem teste que rodou e passou | Bloqueia | 4 |
| Teste que cita um ID que não está em nenhum arquivo de aceite, ou que foi pulado | Bloqueia | 4 |
| PR que altera código em `apps/` sem a seção `## Aceite` | Bloqueia | 4 |
| Teste do harness que falhou, ou relatório dele sem teste ou com teste pulado | Bloqueia | 4 |
| O agente edita um arquivo de aceite já versionado | Nega a edição | 7 |
| PR que altera, renomeia ou apaga um arquivo de aceite que já existe na `main` | Aviso no PR | 7 |
| Contrato (snapshot da OpenAPI) ou schema do Prisma diferente do commit de plano | Aviso no PR | 8 |
| Achado do revisor | Comentário no PR | 5 |
| Push do agente com segredo nos commits da branch | Nega o push | 6 |
| Push do agente sem o modo completo aprovado para o último commit | Nega o push | 6 |
| Terceira reprovação seguida do modo completo nos mesmos passos, na máquina | Trava o modo completo até o usuário destravar | 9 |
| O agente roda o destravamento do modo completo | Nega o comando | 9 |
| O agente roda o `verify.sh` com `CI=` ou `GITHUB_ACTIONS=` no comando | Nega o comando | 9 |

## Script de verificação

O `scripts/verify.sh` roda as verificações dentro dos contêineres do `compose.dev.yaml` e tem estes modos:

| Modo | O que roda | Quem chama |
| --- | --- | --- |
| `fast [app...]` | Tipos e lint das apps citadas, ou de todas | O hook de fim de turno |
| `full [--start-apps]` | O grupo completo de todas as apps, os testes do harness, o aceite e a varredura de segredos. É o veredito, e grava a aprovação que o push exige. Fora da CI, conta as reprovações repetidas e trava ("Trava das reprovações repetidas") | A CI, e o agente uma vez, no fim da tarefa, antes do commit que a fecha |
| `full <app>... [--start-apps]` | Só o grupo completo das apps citadas. Não confere a tabela nem os segredos, não grava aprovação e não entra na trava | Ninguém por regra (`AGENTS.md` da raiz, "Definição de pronto") |
| `prepush` | A varredura de segredos e a conferência de que o modo completo aprovou o último commit | O hook de antes do push |
| `unlock` | Tira a trava do modo completo e zera a contagem | Só o usuário, com `!` no prompt. O hook de antes do comando o nega ao agente |
| `apps` | A lista das apps registradas | O hook de fim de turno |
| `contract [<de> [<para>]]` | A visão legível do contrato e do schema entre dois pontos do Git (commits, ou a árvore do índice), ou entre um ponto e a pasta de trabalho, em Markdown. Sem argumentos, do `HEAD` até a pasta. É o comando do contrato da skill de plano. Não verifica nem aprova nada (etapa 8) | O script da página do plano, e quem quiser ler um delta |
| `plan <issue> <ticket> [<commit de plano>]` | Atalho para o script da página da skill de plano, com os valores deste projeto: a página de revisão do plano do ticket, gravada na pasta dele (`plano.html`; "Por que o aceite fica na pasta do ticket"), do que está preparado no índice, com a mensagem proposta, ou do commit de plano. A lógica é do script da skill. Não verifica nem aprova nada (etapa 7) | A `/plan-ticket`, na parada para aprovação, e quem quiser rever um plano já aprovado |

- **Códigos de saída:** 0 quando tudo passou, 1 quando alguma verificação falhou e 2 quando não deu para verificar (contêiner fora do ar, web ou API sem responder).
- **Suítes da web:** o grupo completo roda a suíte de unidade (Vitest, `reports/unit.json`) antes do build e depois a suíte no navegador (Playwright, `reports/playwright.json`). Cada relatório passa pelo `check_report`, que reprova relatório ausente, suíte vazia e teste pulado.
- **A suíte no navegador roda contra o build de produção.** Depois do `pnpm build`, o grupo da web serve o build com o `next start` na porta 3100 do contêiner `web` (passo "Web: build no ar"), roda a suíte com `WEB_BUILD_URL=http://web:3100` e tira o build do ar em seguida, passe ou falhe a suíte. Uma só função do `scripts/verify/web.sh` (`web_browser_suite`) é dona do `next start`: ela o sobe, roda a suíte e o derruba, e antes de subir derruba o que uma verificação interrompida tenha deixado na porta. Ela só encerra o processo do PID gravado se ele ainda é esse `next start`, pela marca que ele leva no ambiente, e espera ele sair. Se outro servidor já responde na porta 3100, o passo "Web: build no ar" reprova pedindo para pará-lo, em vez de rodar a suíte contra ele. Na espera pela subida, o processo que para antes de responder reprova na hora, com o log, sem esperar os três minutos. Quais testes rodam contra o build, e quais contra o servidor de desenvolvimento, está no `apps/web/AGENTS.md`, "Testes no navegador". Um build que falha reprova só o passo "Web: build", e um que não responde, só o "Web: build no ar": nos dois casos a suíte não roda, e o passo "Aceite" reprova pela falta do relatório dela. Por quê: o servidor de desenvolvimento compila sob demanda e se comporta diferente do build (pré-renderização, cache, Server Components), e o que vai para produção é o build. O servidor de desenvolvimento, na porta 3000, continua para o dia a dia e para os testes avulsos.
- **Relatórios:** cada suíte grava um JSON em `reports/`, na pasta do projeto, e o `scripts/check-report.cjs` o confere. O grupo completo de cada app apaga os relatórios antigos dela no começo, para que só valha a evidência da execução atual.
- **O `full` com apps não aprova nada.** Ele confere uma app inteira sem pagar a outra, mas a suíte no navegador da web fala com a API real, e uma mudança só na API pode quebrá-la. Por isso o push e a CI continuam exigindo o `full` sem apps, e o `full` com apps termina avisando isso.
- **Por que o `full` roda uma vez, no fim:** ele leva minutos, e o agente que o rodava depois de cada mudança gastava a tarefa esperando o veredito de coisas que os testes do arquivo e o `fast` já diziam. A regra está no `AGENTS.md` da raiz, "Definição de pronto".
- **Web e API no ar:** a suíte no navegador depende da API e do servidor de desenvolvimento da web, que serve a vitrine; o build, o próprio script serve. Na máquina, o script exige que os dois já estejam respondendo. Com `--start-apps`, usado pela CI, ele mesmo os sobe.
- **Node do harness:** o conferidor do aceite, o renderizador da visão do contrato e os testes do harness rodam no contêiner `api`, pelo comando do Node do projeto, sobre o repositório montado em `/repo`, só para leitura. O desenho está na etapa 7, linha "Comando do Node".
- **Segredos:** o gitleaks, em versão fixa, olha os commits que a branch tem a mais do que a `origin/main`. A variável `HARNESS_BASE_REF` troca essa base. Num push na `main`, a CI a aponta para o commit anterior ao push, porque ali a `origin/main` já é o próprio commit enviado.

### Grupos por app

O `verify.sh` é o motor: os auxiliares, o despacho dos modos e o que atravessa as apps (testes do harness, aceite, segredos e aprovação). O que cada app verifica fica num arquivo dela, em `scripts/verify/<app>.sh`, que define três coisas e, se for o caso, uma quarta:

| Nome | O que é |
| --- | --- |
| `<app>_fast` | Os passos rápidos da app, como tipos e lint |
| `<app>_full` | O grupo completo: chama o `<app>_fast` e acrescenta as suítes, o build e o que mais a app tiver |
| `<app>_reports` | Os relatórios das suítes que o aceite confere |
| `<app>_contract_drift` | Opcional, só na app com contrato planejado: o desvio do contrato e do schema em relação ao commit de plano (etapa 8). O motor o chama nas apps que o definem |

O registro `APPS`, no topo do motor, lista as apps. O nome de cada uma é o da pasta em `apps/` e o do serviço no Compose. O `full` sem apps, o `fast` sem apps e o hook de fim de turno percorrem esse registro.

- **Comando novo numa app:** um `step` a mais no `<app>_fast` ou no `<app>_full`, com o nome e o "como corrigir". Se ele for uma suíte com relatório, o relatório entra também no `<app>_reports`.
- **App nova:** um arquivo em `scripts/verify/` e o nome dela no `APPS`.
- **Tudo continua em `scripts/`,** protegido pelo guarda do harness e pela confirmação local.

## CI

O workflow `CI` roda em todo pull request e em todo push na `main`. O job `Veredito` sobe o `compose.dev.yaml` e chama `scripts/verify.sh full --start-apps`. É o único veredito do projeto: o resultado que o agente obtém na máquina não aprova nada.

- **Nova tentativa:** na CI, o teste no navegador que falha roda mais uma vez. Se passar, a suíte é aprovada e o teste aparece como aviso no PR. O aviso existe para que um defeito intermitente real não passe em silêncio.
- **Relatórios:** os JSON, o relatório HTML do Playwright e os traces ficam como artefato da execução.
- **Fora do veredito:** a formatação com o Prettier e a validação visual não são conferidas pela CI.

## Proteção da `main` e guarda do harness

A CI só é um veredito se ninguém puder ignorá-la nem alterá-la em silêncio. Esta etapa fecha os dois pontos.

### Ruleset da `main`

A definição fica versionada em `.github/rulesets/main.json`, e é aplicada no GitHub pelo admin:

```bash
gh api repos/<dono>/<repositório>/rulesets --method POST --input .github/rulesets/main.json
```

| Regra | Valor | Por quê |
| --- | --- | --- |
| Pull request obrigatório | Sim, sem push direto | Toda mudança passa pela CI |
| Checks obrigatórios | `Veredito` e `Guarda do harness` | Os dois têm de passar para o merge |
| Aprovações exigidas | Nenhuma | O projeto tem um único humano, e o GitHub não deixa aprovar o próprio PR |
| Force push e exclusão da branch | Proibidos | O histórico da `main` é a trilha |
| Quem pula as regras | Só o admin, e só em PR | É o override identificado |

- **Ordem de aplicação:** o ruleset só é aplicado depois que os dois workflows estão na `main`. O `Guarda do harness` roda com a versão da `main`, então, antes disso, o check exigido nunca apareceria.
- **Override:** o merge com bypass fica registrado no GitHub, com quem pulou a regra e quando. Serve para o bloqueio por engano, como o de um teste instável, e para as mudanças no próprio harness.

### O agente não faz merge

O `.claude/settings.json` nega o `gh pr merge`. O agente usa a credencial do humano, então, para o GitHub, os dois têm a mesma identidade. É essa regra que faz a trilha de override significar "um humano liberou".

Ela contém o erro, e não a má-fé: o mesmo merge é possível pela API do GitHub. Fechar isso de vez pede uma credencial própria para o agente, sem permissão de merge.

### Guarda do harness

O workflow `Guarda do harness` roda em todo pull request com `pull_request_target`. Com esse gatilho, o GitHub usa a versão da `main` do workflow e do `scripts/harness-guard.sh`, e não a do pull request. Ele lê pela API a lista de arquivos alterados, sem baixar nem executar o código do PR.

| Caminho alterado | Efeito |
| --- | --- |
| `.github/**` (workflows e ruleset) | Bloqueia |
| `.claude/settings.json` | Bloqueia |
| `.claude/hooks/**` | Bloqueia |
| `.claude/agents/**` | Bloqueia |
| `scripts/**` | Bloqueia |
| `.claude/skills/plan-ticket/scripts/**` (os scripts da skill de plano) | Bloqueia |
| `.oxlintrc.json`, `eslint.config.mjs`, `vitest*.ts`, `playwright.config.ts` e `tsconfig*.json` dos projetos | Aviso no PR |
| `package.json` dos projetos, com a seção `scripts` alterada | Bloqueia |
| `package.json` dos projetos, com outra mudança (dependências, por exemplo) | Aviso no PR |
| `Dockerfile.dev` dos projetos e o `compose.dev.yaml` | Aviso no PR |

- **Por que os scripts entram:** a CI chama o `scripts/verify.sh`. Um PR que o trocasse por um comando que sempre passa seria aprovado pelo próprio script trocado.
- **Por que os scripts da skill de plano entram, a pasta inteira:** o conferidor do aceite importa deles o parser do arquivo de aceite (etapa 7), e o modo completo roda os testes da pasta da skill no passo "Testes do harness". Um PR que enfraquecesse o parser, ou os testes dele, enfraqueceria o veredito sem tocar em `scripts/`. O texto da skill (o `SKILL.md` e os `formatos/`) não entra: muda em tarefa normal, e é lido pelo revisor e no merge.
- **Arquivo renomeado:** o nome anterior também é conferido, para que mover um arquivo protegido conte como alterá-lo.
- **Lista vazia reprova:** se a API não devolver nenhum arquivo, o guarda sai com erro, em vez de aprovar sem ter conferido.
- **Consequência:** toda mudança no harness é reprovada pelo guarda e só entra por override do admin. Mexer nas regras vira sempre um ato humano registrado.
- **Espere o `Veredito` ficar verde antes do bypass.** O bypass pula todos os requisitos do ruleset, e não só o guarda: o GitHub aceita o merge com o `Veredito` ainda rodando ou reprovado. Num PR que altera o harness, o guarda reprova em segundos e o `Veredito` leva minutos, então o botão de bypass aparece antes de a verificação terminar. Quem garante que a mudança passou na CI, nesse caso, é o admin.
- **PR grande demais reprova:** a API do GitHub lista no máximo 3.000 arquivos por pull request. A partir desse total, um arquivo protegido poderia ficar fora da lista, então o guarda sai com erro.
- **Comandos do `pnpm`:** o `scripts/verify.sh` chama os comandos da seção `scripts` de cada `package.json`. Trocar `vitest run` por um comando que sempre passa enfraqueceria a verificação com os dois checks verdes. O guarda compara essa seção entre a `main` e o PR e bloqueia quando ela muda. O `package.json` do PR é baixado só para leitura, e nada dele é executado. Um `package.json` criado, apagado ou renomeado conta como mudança.
- **O que só avisa, e o risco disso:** o `compose.dev.yaml` e os `Dockerfile.dev` definem o ambiente em que a verificação roda, e as dependências do `package.json` definem as ferramentas. Um PR pode enfraquecer a verificação por eles, e os dois checks continuam verdes. Eles mudam em tarefas normais, e bloqueá-los tornaria o bypass rotineiro. O aviso no PR aponta a mudança, mas quem a lê e decide é o humano no merge: neste ponto, o controle é a leitura do diff, e não um bloqueio.

### Confirmação local

Editar ou criar um arquivo em `.github/**`, `.claude/settings.json`, `.claude/hooks/**`, `.claude/agents/**`, `scripts/**` e `.claude/skills/plan-ticket/scripts/**` pelas ferramentas de edição do agente pede a confirmação do humano, mesmo com o modo automático ligado. É a regra `ask` do `.claude/settings.json`. Ela não é `deny` porque mudanças legítimas no harness existem.

A regra não cobre o que o agente faz por comando de shell: um redirecionamento ou um script que grave nesses caminhos não passa por ela. Por isso ela é um aviso cedo para o caminho comum, e não uma garantia. A garantia é o guarda na CI, que confere o que chegou ao pull request, seja qual for o meio usado para escrever.

## Hook de fim de turno

A CI dá o veredito, mas leva minutos. O hook traz os checks rápidos para dentro do laço do agente, sem depender de ele lembrar da definição de pronto.

O `.claude/settings.json` registra o `.claude/hooks/stop-verify.sh` no evento `Stop` do Claude Code, que dispara quando o agente tenta encerrar o turno. Ele só responde pelos arquivos que a própria sessão editou, anotados por um segundo hook, o `.claude/hooks/record-touched.sh`, registrado no evento `PostToolUse` das ferramentas `Edit`, `Write` e `MultiEdit`.

| Situação ao encerrar o turno | O que o hook faz |
| --- | --- |
| A sessão não editou arquivo em `apps/` | Nada, sem rodar verificação |
| Os arquivos que a sessão editou na app têm o conteúdo da última verificação aprovada | Nada |
| Arquivos editados pela sessão, ainda não verificados | Roda `scripts/verify.sh fast` nas apps desses arquivos |
| A verificação passa | Deixa o turno encerrar e guarda o estado aprovado |
| A verificação falha em arquivo que a sessão editou | Bloqueia o encerramento e devolve a saída ao agente, que continua |
| A verificação falha só em arquivos que a sessão não editou | Deixa o turno encerrar e mostra um aviso ao usuário, sem guardar o estado aprovado |
| Uma falha não tem arquivo a que atribuí-la (um passo sem caminho de erro, ou uma saída sem o resumo dos passos) | Bloqueia, e diz que não deu para atribuí-la |
| A sessão não pode ser atribuída (`session_id` ausente ou inválido, ou o `jq` ausente) | Não bloqueia, mas mostra um aviso ao usuário de que nada foi verificado |
| Os contêineres estão fora do ar | Bloqueia, com a instrução de subir o ambiente |
| A lista de apps não pode ser lida do script | Bloqueia |
| Três bloqueios seguidos na mesma sessão | Deixa o turno encerrar e mostra um aviso ao usuário |

- **Quais apps:** as do registro `APPS`, que o hook lê com `scripts/verify.sh apps`. Uma app nova entra no hook sem mexer nele.
- **Por que por sessão:** vários agentes podem trabalhar no mesmo clone, e o erro de tipo ou de lint que um deixa na pasta de trabalho bloquearia o turno de outro que não tem relação com ele. Cada sessão responde só pelo que editou.
- **O registro:** o `record-touched.sh` grava, em `harness/touched-<sessão>` na pasta `.git`, o caminho de cada arquivo de `apps/` que a sessão editou, relativo à raiz, uma linha por arquivo e sem repetição. O caminho é normalizado para a forma que as ferramentas imprimem (sem `./`, `/./` nem o prefixo absoluto da raiz, que vem do `git rev-parse --show-toplevel`). Arquivo fora de `apps/` não entra, e um segmento `..` (travessia) também não; `foo..bar.ts` é um nome válido. O `session_id` entra no nome do arquivo, então só vale com letras, dígitos, `_` e `-` nos dois hooks: com outro formato, o registro não anota nada. Um subagente traz o mesmo `session_id` da sessão que o chamou, mais o `agent_id`, então as edições dele vão para o arquivo da sessão. O hook lê o `file_path` da entrada, e os `file_path` de cada edição do `MultiEdit`; nunca bloqueia nem falha a ferramenta (sai sempre com 0) e é rápido, porque roda a cada edição.
- **Limite aceito:** edição por comando de shell (`sed`, `mv`, um gerador) não é anotada, e o hook de fim de turno não a vê. O modo completo confere a árvore inteira e pega o que ficou de fora.
- **O que bloqueia:** o hook lê o caminho de cada erro na saída do `fast`, só nos passos de formato conhecido: os passos `tipos` (linhas `caminho(linha,coluna): error TS` do `tsc`) e `lint` (blocos do `oxlint` na API, que começam com `x ` quando são erro e com `!` quando são aviso, e os do `eslint` na web, com a linha `error` ou `warning`). Só erro conta: um aviso num arquivo da sessão nunca bloqueia. Os caminhos são relativos à pasta da app ou absolutos no contêiner. O prefixo do nome do passo (`API:`, `Web:`) diz a qual app o erro pertence, e o caminho só se compara com os arquivos que a sessão registrou nessa app. Um passo de outro formato (testes, build, tipos de rota) que falha não dá caminho nenhum e bloqueia, porque a falha não tem arquivo a que atribuí-la. Limite: caminho com espaço não é reconhecido, e a falha dele bloqueia pelo mesmo motivo. Um erro em arquivo registrado bloqueia, na mesma mensagem de antes. Se todos estão em outros arquivos, o turno encerra com um aviso: o erro é de outra sessão, ou de um arquivo que depende do que a sessão mudou, e o modo completo o confere. O aviso não grava a aprovação.
- **Por que guardar o estado aprovado:** um turno que não mudou o conteúdo dos arquivos da sessão não precisa pagar a verificação de novo. O hook guarda, em `harness/fast-ok-<sessão>-<app>`, o resumo do conteúdo dos arquivos da sessão na app; o arquivo registrado que deixou de existir sai da conta, e uma app sem arquivo existente não é verificada. O código que o agente commitou no mesmo turno também conta, porque o resumo é do conteúdo, e não do que está em commit.
- **Sessão que não dá para atribuir:** sem `session_id` válido, ou sem o `jq`, o hook não tem o que conferir. Ele não bloqueia nem falha calado: mostra um `systemMessage` dizendo que a sessão não foi atribuída e que nada foi verificado.
- **Limpeza:** a cada execução, o hook apaga da pasta `harness` os `touched-*`, os `fast-ok-*` e os `stop-blocks-*` com mais de sete dias, de sessões que acabaram. Em cada execução que usa o registro da sessão, ele dá `touch` no `touched-<sessão>`, então a data do arquivo é a do último uso e o registro de uma sessão ativa não some.
- **A trava do modo completo continua do clone inteiro, de propósito:** a reprovação repetida do `full` é do conjunto da árvore, e não de uma sessão ("Trava das reprovações repetidas").
- **Falha fechada:** com arquivo editado e os contêineres fora do ar, o hook bloqueia, em vez de passar calado.
- **Limite de três bloqueios:** um erro que o agente não consegue corrigir viraria um laço sem fim. Depois do terceiro bloqueio seguido, o turno encerra e o usuário vê um aviso de que a verificação continua falhando. É um dos pontos em que o hook deixa passar uma falha, e ela continua sendo pega pela CI.
- **Só o Claude Code:** outro agente não dispara este hook. Para ele, valem a instrução do `AGENTS.md` e a CI.
- **Testes:** `scripts/test/record-touched.test.sh` testa o registro (o que entra e o que não, a normalização do caminho, o `session_id` inválido, a ausência de repetição, o `MultiEdit`, o subagente e a saída sempre 0). `scripts/test/stop-verify.test.sh` testa o hook de fim de turno em dois ou mais cenários de sessão, num repositório temporário, com o `scripts/verify.sh` trocado por um falso, pela variável `HARNESS_VERIFY` do hook, que só os testes usam: o hook só a honra com `HARNESS_TEST=1`, que os testes também definem, e a ignora sem ela. As duas rodam na máquina, como as demais suítes em shell, no passo "Testes do harness".
- **Fora:** hook de verificação a cada edição de arquivo (o código fica quebrado no meio de uma mudança, e a verificação viraria ruído; o `record-touched.sh` só anota, sem verificar), suítes de teste no hook (lentas) e hook de Git (redundante com a CI e contornável com `--no-verify`).

## Aceite

A CI passar prova que os testes que existem passam. Não prova que cada critério de aceite tem um teste. O aceite fecha essa distância: cada ticket tem um arquivo de aceite com os critérios e seus IDs, cada teste de aceite leva o ID no título, e a CI confere que todo critério que exige teste tem um que rodou e passou.

O formato da seção do PR está no `AGENTS.md` da raiz, seção "Aceite no pull request". O do critério e do arquivo de aceite é da skill de plano (`.claude/skills/plan-ticket/formatos/aceite.md`), e o `AGENTS.md`, em "Plano do ticket", aponta para ele.

| Situação | Efeito |
| --- | --- |
| Critério com marca de teste, em qualquer arquivo de aceite (`docs/tickets/<issue>/<ticket>/aceite.md`), sem nenhum teste com o ID dele | Bloqueia |
| Um teste com o ID do critério falhou ou foi pulado | Bloqueia |
| Um teste cita um ID que não está em nenhum arquivo de aceite | Bloqueia |
| Marca desconhecida num arquivo de aceite, ou ID repetido | Bloqueia |
| O PR altera código em `apps/` e não tem a seção `## Aceite` | Bloqueia |
| A seção não cita um arquivo de aceite existente nem diz "nenhum" com o motivo | Bloqueia |
| Falta o relatório de alguma suíte | Bloqueia |
| O PR não altera nada em `apps/` e não tem a seção | Passa, e a cobertura continua conferida |
| Critério com marca de revisão humana ou de documento | Não exige teste |

- **Sem corpo de PR:** a cobertura dos critérios roda sempre, também numa branch sem `ACCEPTANCE_BODY_FILE` e num push na `main`. O que depende do corpo é só a seção `## Aceite`.
- **Onde é conferido:** no fim do `scripts/verify.sh full`, pelo `scripts/check-acceptance.cjs`, que lê o arquivo de aceite de cada pasta de ticket (`<issue>/<ticket>/aceite.md`) dentro da pasta dos tickets que recebe (`docs/tickets`, relativa à raiz do repositório, de onde saem também o caminho que o corpo do PR cita e o das mensagens; o resto da pasta não é lido), o corpo do PR e os relatórios JSON das suítes da própria execução. O parser do arquivo de aceite (`parseAcceptanceFile`), as marcas (`CHECKS`) e o nome do arquivo de aceite (`ACCEPTANCE_NAME`) ele importa da skill de plano (`.claude/skills/plan-ticket/scripts/plan.cjs`), o mesmo parser da página de revisão do plano, que ele acha no mesmo caminho relativo dentro do repositório. Faz parte do `Veredito`. Ele roda no contêiner `api`, sobre o repositório montado em `/repo` (linha "Comando do Node" da etapa 7): lê de lá os arquivos de aceite e os relatórios das apps, e o corpo do PR, que não está no repositório, chega pela entrada padrão.
- **Marcas:** as da skill de plano (`formatos/aceite.md`); as que exigem teste são as do `CHECKS` do parser dela. A marca é uma promessa sobre o nível do teste, que o revisor lê. O conferidor não a confere, nem a camada do teste: ele lê os relatórios no formato do Vitest e no do Playwright e liga o teste ao critério só pelo ID no título.
- **Testes do harness:** o conferidor, o renderizador da visão do contrato (etapa 8) e os critérios de aceite deste projeto sobre a skill de plano (o parser e a página de revisão do plano, etapa 7, pelos módulos da skill) têm testes em `scripts/test/`; a skill tem os próprios, sem ID de critério, para valerem em qualquer projeto que a copie, em `.claude/skills/plan-ticket/scripts/test/`. Os testes em shell, que rodam na máquina porque usam o `git` e o `jq` (os dos hooks, `scripts/test/plan-page.test.sh` sobre os argumentos e o `.gitignore` do script da página do plano, `scripts/test/verify-plan.test.sh` sobre os argumentos do modo `plan`, `scripts/test/harness-guard.test.sh` sobre o aviso de aceite congelado da guarda e os da trava do modo completo), rodam no mesmo passo. Todos rodam com o runner nativo do Node, rodados no contêiner `api` no passo "Testes do harness" do `verify.sh full`. Teste que falha reprova o veredito. Um repórter próprio do `node:test` (`scripts/test/node-test-report.cjs`) grava o relatório deles em `reports/harness/node-tests.json`, na pasta da API (`/app`, a que aceita escrita no contêiner; o grupo completo da API recria essa pasta vazia, porque o Node não a cria), no formato do Vitest: o passo o confere com o mesmo `check_report` das suítes (ao menos um teste, nenhum pulado), e o conferidor o lê ao lado dos relatórios das apps. Assim o conferidor continua com dois formatos. São os primeiros testes de uma peça do harness, porque o conferidor decide um bloqueio sobre todos os tickets, e um erro nele reprova ou libera em silêncio a matriz inteira.
- **ID no título, e não nas `tags` do Vitest:** com `strictTags`, cada tag teria de ser declarada no config da API, que não enxerga os arquivos de aceite. No Playwright, o conferidor lê o ID no título e nas tags. O formato é o token `@<ticket>-CA<n>` no título.
- **Todos os tickets:** a cobertura confere todos os arquivos de aceite, e não só o do PR. Um ticket futuro que apague ou enfraqueça o teste de um critério antigo é reprovado.
- **Quando a seção é exigida:** quando o PR altera algum arquivo em `apps/`. O critério é o caminho, e não o nome da branch, que é o agente quem escolhe. Um documento dentro de `apps/`, como o `AGENTS.md` de um projeto, conta como mudança na aplicação.
- **Corpo editado, CI de novo:** a seção mora no corpo do PR, então a CI roda outra vez quando ele é editado.
- **O que o humano confere no merge:** que o arquivo citado é o do ticket e que os critérios dele são os do Linear. A CI não lê o Linear, porque isso pediria um segredo de API no repositório.
- **Limite:** a cobertura prova que existe um teste com o ID que rodou e passou. Não prova que ele verifica o critério: uma asserção fraca continua passando, e nada impede pôr o ID num teste sem relação com o critério. O que cobre isso é o revisor, a leitura no merge e, como evolução, o mutation testing.
- **Limite:** nada confere ainda que um critério acrescentado no Linear depois do plano chegou ao arquivo de aceite.
- **O commit de plano sozinho não passa:** o arquivo de aceite novo traz critérios com marca de teste, e os testes só existem depois da implementação. O modo completo e a CI conferem o PR inteiro, com o plano e a implementação, e é por isso que o push vem depois da implementação, e não depois do commit de plano.
- **O ID vale só no título do próprio teste:** o título de um `describe` não conta, porque um único teste qualquer dentro dele cobriria o critério.

## Revisor de conformidade

Os controles anteriores conferem fatos: o teste passou, o arquivo protegido mudou, o teste citado existe. Nenhum deles julga se a mudança entrega o que foi planejado nem se o teste prova o critério. Esse julgamento é do revisor de conformidade.

O princípio é que quem faz não avalia. A separação é de papel, e não de modelo: o revisor roda no mesmo modelo, mas com outras instruções, outros insumos e sem permissão de escrita.

| Aspecto | Como é |
| --- | --- |
| Quem revisa | O subagente `revisor-conformidade`, definido em `.claude/agents/revisor-conformidade.md` |
| O que ele confere | O que o `REVIEW.md` da raiz diz para toda revisão, mais o que só ele vê, descrito no arquivo dele: os critérios do ticket no Linear contra o arquivo de aceite, as decisões da mensagem do plano e o desvio do contrato desde o commit de plano |
| O que ele recebe | O diff da pasta de trabalho contra a base, com os arquivos novos, na pasta do ticket (`review.diff`), o identificador do ticket, a mensagem do commit de plano (`plano.txt`, porque ele não tem `git`) e a visão do desvio do contrato desde o commit de plano (`contract-drift.txt`, pelo `scripts/verify.sh contract`, etapa 8), ou o aviso de que ela não existe. Em mudança sem ticket, os critérios de aceite no lugar do identificador. Nunca o resumo nem a opinião de quem implementou |
| Quando roda | Depois da `/code-review` e antes do `full`, para as correções entrarem na única verificação completa da tarefa |
| O que ele pode fazer | Ler o repositório e o ticket. Não tem ferramenta de escrita nem de shell |
| Onde fica o resultado | Num comentário no PR, com cada achado marcado como corrigido ou não, o motivo e o relatório na íntegra |
| Efeito | Nenhum bloqueio. A CI não lê o comentário |

O passo a passo que o agente segue e o formato do comentário estão no `AGENTS.md` da raiz, seção "Revisão de conformidade".

- **Por que um foco só:** os defeitos gerais de código já têm a `/code-review`, na máquina, e o Copilot, no PR. O revisor de conformidade é o único que lê o aceite, o commit de plano e o ticket juntos, e por isso fica com o plano: repetir a caça a defeitos custaria uma revisão a mais sem ganho.
- **Por que o `REVIEW.md`:** o Copilot code review e o Claude Code Review leem o `REVIEW.md` da raiz no PR (o Copilot, da branch do PR). Com o que conferir nele, as três revisões aplicam as mesmas conferências de conformidade, e o arquivo do agente fica só com o que depende do contexto local: o Linear, o diff da pasta de trabalho e a visão do desvio. O Copilot lê só o começo de cada arquivo de instruções, e por isso o `REVIEW.md` fica abaixo de 4.000 caracteres e aponta para os documentos donos, em vez de repeti-los.
- **O que ele cobre que a CI não cobre:** a cobertura do aceite prova que existe um teste com o ID do critério e que ele passou. O revisor lê as asserções contra o cenário aprovado e aponta o teste que passaria mesmo com o comportamento quebrado. E só ele vê o Linear: um critério acrescentado lá depois do commit de plano não chega à CI.
- **Por que não bloqueia:** o revisor é inferencial e não foi calibrado. O mesmo diff pode render achados diferentes em duas execuções, e ele pode apontar um defeito que não existe. Dar poder de bloqueio a isso trocaria um veredito reprodutível por um que não é.
- **Todo achado fica registrado,** inclusive o que o agente que implementou considera errado. Assim, a decisão sobre um achado não corrigido é do humano no merge, e não de quem escreveu o código.
- **A definição do revisor é arquivo do harness.** O `.claude/agents/` está entre os caminhos protegidos pelo guarda, porque enfraquecer as instruções do revisor enfraqueceria a revisão sem alterar nenhum check. O `REVIEW.md` não está: ele é lido também por ferramentas de fora do harness, e a mudança nele aparece no diff do PR.
- **Limite:** este passo é uma instrução, e instrução pode ser pulada. A CI poderia reprovar o PR sem o comentário, mas isso daria poder de bloqueio a uma peça inferencial pela porta dos fundos. A falta do comentário aparece só para o humano, no merge.
- **Limite:** o diff traz a pasta de trabalho, e o arquivo novo só entra depois do `git add -N`. Arquivo novo que fique de fora fica fora da revisão, e por isso o passo a passo pede a conferência do `git status`. O commit que vem depois das correções não passa de novo pelo revisor; o `full` o verifica.
- **Limite:** o revisor não roda o código nem os testes. Ele lê. O que só aparece em execução fica para a CI.
- **Limite:** nenhum revisor pega bem um requisito mal entendido quando o ticket também está errado. A atenção humana continua necessária na fronteira entre especificar e implementar.

## Bloqueio no push

Rodar o modo completo antes de enviar o código era só uma regra do `AGENTS.md`, e controle que existe só como instrução é pulado. Quando o agente pulava, o erro aparecia minutos depois, numa rodada de CI. Esta etapa transforma a regra em mecanismo.

O `.claude/settings.json` registra o `.claude/hooks/push-verify.sh` no evento `PreToolUse` do Claude Code, para a ferramenta de shell. Quando o comando é um `git push`, o hook chama `scripts/verify.sh prepush` e nega o comando se ele não passar. O mesmo hook nega os comandos que mexeriam na trava do modo completo ou no estado da verificação ("Trava das reprovações repetidas"), num só processo para a ferramenta de shell. Como as demais guardas do hook, o bloqueio é para um agente que coopera, e não uma barreira de segurança.

| Situação no push | O que o hook faz |
| --- | --- |
| Os commits da branch trazem um segredo | Nega |
| A branch não altera nada do que a verificação lê | Deixa passar, depois da varredura de segredos |
| O modo completo aprovou o conteúdo do último commit | Deixa passar |
| O modo completo não rodou, reprovou, ou aprovou outro conteúdo | Nega, com a instrução de rodar |
| A branch altera `apps/` e o modo completo aprovou sem conferir o aceite | Nega, com a instrução de rodar com o corpo do PR |
| A base da branch não é encontrada, ou a varredura não consegue rodar | Nega |
| O comando é um push sozinho que apaga uma branch remota (`--delete`) | Deixa passar, porque não envia código |
| O hook não consegue ler o comando, e a entrada cita `git` e `push` | Trata como push |

O passo a passo que o agente segue está no `AGENTS.md` da raiz, seção "Antes do push".

- **O bloqueio é no push porque é ele que gasta rodada de CI.** Toda execução da CI num pull request nasce de um push, na abertura e nas correções.
- **O que a aprovação cobre:** o conteúdo de `apps/`, do `compose.dev.yaml`, de `scripts/`, dos scripts da skill de plano (`.claude/skills/plan-ticket/scripts/`, de onde o conferidor importa o parser) e de `docs/tickets/`, que é o que a verificação lê. Da pasta dos tickets, só conta o que o Git versiona (etapa 7, "Por que o aceite fica na pasta do ticket"). O modo completo resume esse conteúdo no começo da execução e, se terminar aprovado, grava o resumo na pasta `.git`, fora do versionamento. O hook compara com o resumo do último commit.
- **Documento fora dos caminhos verificados não invalida a aprovação.** Tipos, lint, testes e build não mudam de resultado por causa de um documento, e exigir cinco minutos de verificação para um ajuste de texto levaria a contornar o bloqueio.
- **Documento dentro de `apps/` invalida.** A aprovação cobre a pasta inteira, sem distinguir código de texto, então mudar o `AGENTS.md` de um projeto pede o modo completo de novo.
- **A varredura de segredos roda em todo push,** inclusive no de documento. É a única verificação em que a CI chega tarde: quando ela reprova, o segredo já está no repositório remoto.
- **O aceite entra na aprovação.** Na máquina, o modo completo só confere o aceite quando recebe o corpo do PR num arquivo. Sem essa exigência, o mesmo comando aprovaria na máquina e reprovaria na CI.
- **Mudança sem commit conta para o aceite.** O modo completo costuma rodar antes do commit, então ele considera a pasta de trabalho, e não só os commits, para decidir se a seção `## Aceite` é exigida.
- **Sem exceção para o agente.** Não há variável nem argumento que desligue o bloqueio. O push sem verificação, como o de um trabalho pela metade, é do usuário, no terminal. Segue o desenho do merge e do bypass: o caminho fora da regra é um ato humano.
- **Limite:** o hook só vê o push que o agente faz por comando de shell. O push do usuário no terminal e um push feito pela API do GitHub não passam por ele. O bloqueio contém o esquecimento, e não a má-fé; a garantia continua sendo a CI.
- **Limite:** o hook reconhece o `git push` pelo texto do comando, quando ele está no começo de uma linha ou depois de `;`, `&`, `|` ou `(`. Um push embrulhado em outro programa, como `sh -c`, não é reconhecido. No sentido contrário, um texto que tenha `git push` no começo de uma linha, como o corpo de um PR, é conferido como se fosse um push.
- **Limite:** o hook confere o último commit da pasta do projeto. Um push de outra branch ou de outro repositório, feito no mesmo comando, é conferido contra esse commit.
- **Limite:** a aprovação fica na máquina. Em outro clone, ou depois de apagar a pasta `.git/harness`, o modo completo precisa rodar de novo.
- **A pasta `.git/harness` é só do estado interno:** as aprovações do modo completo (`full-ok`) e do hook de fim de turno (`fast-ok-*`), o registro de arquivos por sessão (`touched-*`), o contador de bloqueios do hook enquanto ele bloqueia e a trava do modo completo (`full-lock`, "Trava das reprovações repetidas"), que ninguém precisa ler. O hook nega ao agente o comando que cite essa pasta ("Trava das reprovações repetidas"). O que o humano e o revisor leem fica na pasta do ticket (etapa 7, "Página de revisão do plano").
- **Limite:** o hook confere o arquivo do corpo do PR que o agente apontou, e não o corpo que ele publica depois. Se os dois divergirem, a CI reprova.
- **Só o Claude Code:** outro agente não dispara este hook. Para ele, valem a instrução do `AGENTS.md` e a CI.

## Trava das reprovações repetidas

Um agente que reprova no modo completo tende a tentar de novo, e cada tentativa custa minutos. Quando a causa não está ao alcance dele, as tentativas viram um laço: a mesma falha, a mesma correção que não corrige. A trava interrompe esse laço na máquina e devolve a decisão ao usuário.

| Situação no `scripts/verify.sh full`, sem apps e fora da CI | Efeito |
| --- | --- |
| Reprova (sai com 1) | Conta a reprovação pelo conjunto de passos que falharam |
| Reprova nos mesmos passos da reprovação anterior | Soma um à contagem e avisa quantas faltam para travar |
| Reprova em outro conjunto de passos | A contagem recomeça em um |
| Aprova | Zera a contagem |
| Não deu para verificar (sai com 2, "NÃO VERIFICADO") | Não mexe na contagem |
| Terceira reprovação seguida nos mesmos passos | Trava, e a saída manda o agente parar e pedir ao usuário que destrave |
| Travado | Recusa rodar (sai com 2), com a mesma instrução |
| `scripts/verify.sh unlock` | Tira a trava e zera a contagem |

- **A mesma falha é o mesmo conjunto de passos,** pelos nomes deles, em qualquer ordem, seja qual for o teste que falhou dentro de cada um. Um teste diferente quebrado no mesmo passo conta como a mesma falha: a pergunta é se o agente está saindo do lugar, e não qual linha mudou.
- **Seguidas, entre sessões:** a contagem fica em `.git/harness/full-lock`, com o estado interno da verificação, e atravessa as sessões. Uma sessão nova não recomeça do zero o laço da anterior.
- **Por que só o `full` sem apps:** é ele que custa minutos e que o agente roda para fechar a tarefa. O `full <app>` não aprova nada, e os testes de um arquivo e o `fast` são baratos.
- **Por que fora da CI:** na CI, cada execução nasce de um push, e o limite lá é a regra do `AGENTS.md` de parar depois de duas reprovações no mesmo PR.
- **Só o usuário destrava.** O modo `unlock` existe para ele, pelo `!` do prompt do Claude Code, que roda o comando sem passar pelos hooks. O hook de antes do push (`.claude/hooks/push-verify.sh`, "Bloqueio no push"), que já vê todo comando de shell do agente, nega o que rode o `verify.sh unlock`, com a mensagem de que só o usuário destrava e a mesma instrução que o `verify.sh` dá quando trava (`FULL_LOCK_ASK`, no `scripts/full-lock.sh`). Ao contrário do `git push`, ele não exige a posição de comando: basta o `verify.sh` seguido do `unlock` em qualquer ponto, para pegar também o que vem embrulhado (`timeout`, `nohup`, `command`, `bash -c`, `eval`, um `if`). Uma mensagem de commit que cite os dois também é negada: o hook falha fechado.
- **O estado é da verificação.** O mesmo hook nega todo comando que cite a pasta de estado (`.git/harness`, os arquivos `full-*` dela ou a pasta do Git que o `git rev-parse --git-dir` devolve, seguida de `/harness`), porque é nela que ficam a trava e a aprovação do modo completo. Apagar a trava ou gravar uma aprovação contornaria as duas.
- **A CI não se finge na máquina.** A trava só vale com a variável `CI` vazia, então um `CI=true` na frente do `verify.sh` a desligaria. O mesmo hook nega o comando que cite o `verify.sh` e atribua `CI=` ou `GITHUB_ACTIONS=` (no começo, depois de um espaço, o que inclui o `export` e o `env`, ou depois de `;`, `&`, `|` ou `(`), dizendo que as variáveis desligariam a trava. A atribuição que só aparece entre aspas, como o padrão de um `grep 'CI='` ou a mensagem de um commit, não conta; a que vem entre aspas junto com o `verify.sh`, como num `bash -c`, conta.
- **Subagente não roda o `full`.** O `full`, com ou sem apps, é de quem fecha a tarefa (`AGENTS.md` da raiz, "Definição de pronto"). Só a instrução não bastou: nas avaliações, o subagente que corrigia achados rodou o `full` mesmo com a regra escrita. O mesmo hook nega o `verify.sh full` em qualquer ponto do comando quando a entrada traz o `agent_id`, que o Claude Code só põe no comando vindo de um subagente, e diz para terminar com os testes do que mudou e devolver o resultado.
- **Guardas de cooperação, e não de segurança.** As negações do hook contêm o agente que coopera e esquece, e não são uma barreira de segurança: um comando montado para escapar do reconhecimento pelo texto passa. A garantia continua sendo a CI.
- **Entrada ilegível:** se o hook não consegue ler a entrada, qualquer menção ao `verify.sh` e ao `unlock`, à pasta de estado ou ao `verify.sh` com uma atribuição da CI conta como o comando negado.
- **Testes:** `scripts/test/full-lock.test.sh` testa a contagem e a trava pelas funções do `scripts/full-lock.sh`, que o `verify.sh` carrega, e o próprio `verify.sh` nos modos que não rodam a verificação (o `full` travado, o travado na CI, o `full` que não deu para verificar e o `unlock`), com o estado num repositório temporário. `scripts/test/push-verify.test.sh` testa o hook nesses comandos, pela entrada e pela decisão; o `git push` fica de fora, porque ele chama o `prepush` sobre o estado deste clone. As suítes em shell do harness (essas duas e a do congelamento) dividem o contador e a saída de cada caso, no `scripts/test/sh-helpers.sh`, e rodam na máquina, no passo "Testes do harness" do `verify.sh full`.
- **Limite:** o hook reconhece o destravamento, a pasta de estado e as variáveis da CI pelo texto do comando. Um caminho montado em partes, como uma variável com o nome da pasta, ou a variável `CI` posta no ambiente por outro caminho, não passa por ele. A trava contém o laço, e não a má-fé.
- **Limite:** o passo que reprova sem relação com a mudança, como um teste instável, também conta. Nesse caso, quem decide se é instabilidade é o usuário, ao destravar.
- **Só o Claude Code:** outro agente não dispara o hook. Para ele, a trava ainda recusa o `full`, e a instrução de pedir o destravamento está no `AGENTS.md`.

## Congelamento do aceite

Depois do commit de plano, o arquivo de aceite de um ticket não muda pelas mãos do agente. Duas peças impõem isso, uma na máquina e outra no PR.

| Peça | O que faz |
| --- | --- |
| Hook `.claude/hooks/freeze-acceptance.sh` | No evento `PreToolUse` das ferramentas de edição de arquivo (`Edit`, `Write`, `MultiEdit` e `NotebookEdit`), nega a edição de um `docs/tickets/<issue>/<ticket>/aceite.md` que já está em commit. Libera a criação de um arquivo novo, que é o que a `/plan-ticket` faz, e a edição de qualquer outro arquivo, inclusive os outros da pasta do ticket |
| Guarda do harness | Avisa no PR quando um arquivo de aceite que já existe na `main` é alterado, renomeado ou apagado. Um PR que só cria arquivos de aceite não é sinalizado |

- **Descongelar é do humano,** no editor ou no terminal. A mensagem de negação diz isso ao agente e pede que ele não contorne o bloqueio.
- **Aviso, e não bloqueio, na guarda:** descongelar é legítimo quando um ticket muda um comportamento já entregue, e o humano que faz o merge já lê os avisos da guarda. Bloquear obrigaria a um override do admin a cada descongelamento, o que o tornaria rotina.
- **O que está congelado:** o ID e o cenário. O teste previsto é só uma previsão e não se corrige quando o teste muda de nome ou de lugar.
- **O caminho é normalizado** antes da comparação, então `apps/../docs/tickets/<issue>/<ticket>/aceite.md` também é negado. O congelamento vale a partir do commit: o arquivo ainda sem commit, do plano em andamento, é liberado.
- **Entrada ilegível:** se o `jq` não consegue ler a entrada, qualquer menção a um arquivo de aceite (`docs/tickets/<issue>/<ticket>/aceite.md`) conta como edição de aceite versionado, como no hook do push.
- **Testes:** `scripts/test/freeze-acceptance.test.sh` testa o hook pela entrada que o Claude Code entrega e pela decisão que ele devolve. Roda na máquina, e não no contêiner `api`, porque o hook usa o `git` e o `jq`, que o contêiner não tem. Faz parte do passo "Testes do harness" do `verify.sh full`.
- **Limite:** o hook só vê as ferramentas de edição. Um redirecionamento ou um script por comando de shell que grave num arquivo de aceite não passa por ele, como já acontece com a regra `ask` do `.claude/settings.json`. A garantia nesse caso é o aviso da guarda e a leitura no merge.
- **Limite:** a CI não distingue um commit do humano de um do agente, então a guarda só chama a atenção para o arquivo alterado.
- **Só o Claude Code:** outro agente não dispara este hook.

## Plano do ticket (planejado)

Desta seção, estão implementados o processo da etapa 7 (o fluxo no `AGENTS.md` da raiz e a skill `/plan-ticket`, dona dos formatos), a cobertura dos critérios por ID, descrita em "Aceite", e as conferências do aceite pelo revisor e o congelamento do arquivo de aceite (o hook e a sinalização na guarda), descritos em "Congelamento do aceite". A etapa 8 também está implementada.

A tabela de aceite que existia antes ligava cada critério a um teste, mas só no pull request, escrita por quem implementou, e não conferia se a tabela cobria todos os critérios do ticket. O desenho técnico do ticket (rotas, contrato e schema) também só aparece no código. Entre o ticket, que diz o quê, e a implementação falta uma camada que diga como cada critério será provado e o que muda no contrato e no schema, aprovada antes do código.

### Etapa 7: plano do ticket e aceite congelado

**O fluxo**

1. **Ticket.** No Linear, a spec e o ticket continuam sem caminhos nem código. Cada critério ganha um ID e uma marca de conferência.
2. **Plano.** No início de cada ticket, e não na criação dos tickets, a skill `/plan-ticket` lê o ticket, a spec pai, o LLD e o código atual. Ela acrescenta os IDs aos critérios do ticket que ainda não os têm, escreve o arquivo de aceite, escreve o desenho de contrato e de schema direto no dono dele e escreve a mensagem proposta do commit de plano, com a lista de arquivos e interfaces. Depois, monta a página de revisão do plano e para sem commit.
3. **Commit de plano.** O humano revisa a página e aprova, e só então o agente faz o commit, com a mensagem proposta. O hash dele é a referência do que foi aprovado.
4. **Implementação,** numa sessão nova, com a skill `tdd`. Os seams e a lista de testes já vêm do plano, e cada teste da lista é escrito no ciclo, um por vez, com a tag do ID do critério.
5. **Verificação,** pela CI e pelo revisor, como nas tabelas abaixo.

| Peça | Como é |
| --- | --- |
| ID, marca, arquivo de aceite e o que congela | No formato da skill de plano (`formatos/aceite.md`). Neste projeto, o arquivo fica em `docs/tickets/<issue>/<ticket>/aceite.md`, ao lado do que mais é do ticket, e o critério, no Linear |
| Desenho do ticket | Direto no dono: o contrato e o schema no LLD até a etapa 8, e no snapshot da OpenAPI e no `schema.prisma` depois dela. A lista de arquivos e interfaces, que é o que mais envelhece, fica só na mensagem do commit de plano, no formato da skill de plano (`formatos/mensagem.md`) |
| Aprovação | Pela página de revisão do plano, descrita abaixo |
| Seção `## Aceite` do PR | Substituiu a tabela de aceite: o arquivo de aceite do ticket, ou "nenhum" com o motivo |

| Situação | Efeito |
| --- | --- |
| Conferências do aceite (cobertura por ID, ID órfão, teste pulado, seção `## Aceite`) | Implementadas, descritas em "Aceite" |
| O agente edita um arquivo de aceite já versionado | O hook nega |
| PR que altera um arquivo de aceite já existente, e não só o cria | Aviso da guarda do harness |

- **Por que no início de cada ticket:** o plano cita arquivos, interfaces, rotas e schema, que mudam a cada ticket que entra. Planejado na criação dos tickets, ele descreveria um código que ainda não existe.
- **Por que uma skill separada:** a aprovação vira um ponto de parada real, e a implementação começa em contexto novo, a partir do plano.
- **Por que congelar a lista, e não o código dos testes:** a `tdd` proíbe escrever todos os testes antes, porque testes em lote verificam um comportamento imaginado. Congelar o cenário é mais fraco que congelar o código; o que compensa é o revisor conferir cada teste contra o cenário aprovado.
- **Por que o plano fica no repositório, e não no Linear:** a CI não lê o Linear sem um segredo, o plano cita caminhos, que o ticket não pode citar, e a aprovação fica presa a um commit.
- **Por que a cobertura confere todos os arquivos de aceite:** um ticket futuro que apague ou enfraqueça o teste de um critério antigo é reprovado. Os arquivos de aceite formam a matriz de rastreabilidade do projeto.
- **Descongelar é um ato humano.** Quando um ticket muda um comportamento já entregue, o humano edita o arquivo de aceite antigo, no editor ou no terminal.
- **O revisor ganhou duas conferências,** descritas em "Revisor de conformidade": os IDs do ticket contra os do arquivo de aceite e cada teste contra o cenário do ID dele.
- **Congelamento:** implementado, descrito em "Congelamento do aceite".
- **Caminhos verificados:** a pasta dos tickets está na lista do `verify.sh`, porque mudar o aceite muda o resultado da verificação; dela só conta o que o Git versiona, como no item abaixo.
- **Por que o aceite fica na pasta do ticket:** tudo o que é de um ticket (o aceite, a página do plano, a mensagem proposta, o diff da revisão e o desvio do contrato) fica num lugar só, `docs/tickets/<issue>/<ticket>/`, onde `<issue>` é a issue pai do ticket no Linear (a spec, como `LUI-162`), para os tickets de uma mesma funcionalidade ficarem juntos no editor. É este o dono do desenho das pastas; os outros documentos apontam para cá. O `.gitignore` ignora a pasta inteira de cada ticket, salvo o `aceite.md` (`docs/tickets/*/*/*` e `!docs/tickets/*/*/aceite.md`), e o script da página do plano confere essa regra antes de montar a página. O trabalho sem ticket mora em `docs/tickets/sem-ticket/<nome>/`, na mesma profundidade, com `sem-ticket` no lugar da issue pai e um `<nome>` curto, que a pessoa escolhe; ele não tem `aceite.md` (o PR diz `nenhum`), e só guarda o `review.diff` da revisão. O conferidor do aceite lê só `docs/tickets/*/*/aceite.md`, e a pasta `sem-ticket` passa sem ser notada. O corpo do PR cita o caminho de dois níveis, e o conferidor reprova a citação de um nível (`docs/tickets/<ticket>/aceite.md`) ou de `docs/aceite/<ticket>.md`, dizendo o caminho novo. Os arquivos de aceite moraram em `docs/aceite/<ticket>.md` e depois em `docs/tickets/<ticket>/aceite.md` até serem movidos, sem mudança de conteúdo; o commit de plano de um ticket de antes das mudanças continua achado, porque a busca segue o arquivo pelas renomeações (`git log --follow`).
- **Onde ficam as regras:** os formatos do plano (o critério, o arquivo de aceite, a mensagem do commit de plano e o contrato de rota e de tabela) são da skill de plano, nos `formatos/` dela, desde o LUI-175; o fluxo e os valores deste projeto ficam no `AGENTS.md` da raiz, em "Plano do ticket". As conferências ficam neste documento. A `/plan-ticket` aponta para os dois, e as skills copiadas (`to-tickets`, `implement-spec` e `tdd`) recebem só os ajustes mínimos para não contrariá-los.
- **Ordem:** o processo (o `AGENTS.md`, a `/plan-ticket` e os ajustes nas skills) vem primeiro, para ser usado num ticket piloto antes de a máquina conferi-lo. A cobertura por ID foi implementada antes de existir um piloto, então o formato do arquivo de aceite ainda não foi exercitado num ticket real.
- **Limite:** a cobertura por ID prova que existe um teste aprovado para cada ID. Não prova que ele prova o critério. Isso continua com o revisor e com o humano no merge.
- **Limite:** o hook só vê o que o agente faz pelas próprias ferramentas, e a CI não distingue um commit do humano de um commit do agente. Contém o esquecimento, e não a má-fé.
- **Fora:** arquivos de aceite para os tickets já concluídos.

#### Página de revisão do plano

A aprovação chegava no chat do agente num bloco só, com o aceite, a visão do contrato, o resumo do diff e a mensagem do commit: longo, perdido no histórico e sem como ver cada parte com calma. A página separa as partes em abas, montadas por script a partir do repositório, do mesmo jeito para qualquer agente. O agente escreve só a mensagem proposta do commit de plano.

As abas, de onde cada uma sai e a página em si (estática, sem script e nunca versionada) são da skill de plano (`SKILL.md`, "The page"); os argumentos do script da página, os dois modos dele (do que está preparado no índice, com a mensagem proposta, ou do commit de plano, com a mensagem dele), os códigos de saída e o aviso de mudanças fora do índice estão no cabeçalho do `.claude/skills/plan-ticket/scripts/plan-page.sh`; e o formato da mensagem proposta, com a limpeza que o script faz nela, no `formatos/mensagem.md`. Neste projeto:

| Aba | Fonte neste projeto |
| --- | --- |
| Aceite | O `docs/tickets/<issue>/<ticket>/aceite.md`, lido pelo parser da skill, o mesmo que o conferidor do aceite importa |
| Contrato | A seção `# Contrato` da visão do contrato (`scripts/verify.sh contract`, etapa 8): o `oasdiff changelog` e o contrato completo de cada rota nova ou alterada |
| Schema | A seção `# Schema` da mesma visão: o diff do `schema.prisma` |
| Documentos | O diff de tudo o que o plano muda fora do próprio arquivo de aceite, do snapshot e do schema, como o LLD e o `AGENTS.md` |
| Arquivos e interfaces, Decisões | A mensagem proposta, em `docs/tickets/<issue>/<ticket>/plano.msg`, ou a do commit de plano |

| Peça | Como é |
| --- | --- |
| Atalho | `scripts/verify.sh plan <issue> <ticket> [<commit de plano>]` só chama o script da skill com os valores que o `AGENTS.md` da raiz declara em "Plano do ticket". Fica porque os cenários congelados do LUI-173 (CA4 e CA5) e do LUI-174 (CA2) o citam; a lógica saiu dele no LUI-175 |
| Comando do Node | O `scripts/node-in-api.sh`, uma execução direta no contêiner `api`: `docker compose exec -T -w /repo api node <argumentos>`, sobre o repositório que o serviço monta em `/repo`, só para leitura e com o `.git` coberto por uma pasta vazia, ao lado da pasta da API em `/app`, que continua com escrita (`compose.dev.yaml`). Os dois que o chamam, o script da página e o `node_in_api` do `verify.sh`, rodam da raiz do repositório, e o Node roda sempre na raiz dele no contêiner, `/repo`, com os argumentos como estão. O que mora no repositório (os scripts, os arquivos de aceite, os relatórios das apps) o Node lê de `/repo`; o que nasce na máquina e não está nele chega pela entrada padrão, que o construtor da página, a visão do contrato e o conferidor leem com `-`: o corpo do PR vai cru; as fontes que o script da página junta pelo `git` e as que a visão do contrato junta vão em pares nome e valor terminados por NUL, no formato do cabeçalho do `page.cjs` da skill. O que o Node grava (o relatório dos testes do harness) vai para `/app`, por caminho absoluto. Nenhuma pasta de fontes é criada no repositório. Quando o Node falha, o script diz se o contêiner está fora do ar ou no ar sem a montagem (criado antes dela) e como corrigir |
| Comando do contrato | O `scripts/verify.sh contract`, a visão do contrato (etapa 8) |
| Pasta do ticket | `docs/tickets/<issue>/<ticket>/`, visível no editor (o que o Git versiona nela está em "Por que o aceite fica na pasta do ticket"): o `aceite.md`, `plano.msg` até o commit de plano, `plano.html` desde a parada para aprovação, e `review.diff` e `contract-drift.txt` na revisão (etapa 8 e "Revisor de conformidade"). Na pasta do Git (`$(git rev-parse --git-dir)/harness/`) ficam só as aprovações e a trava da verificação |
| Depois do commit de plano | A `/plan-ticket` monta a página de novo a partir do commit de plano (`scripts/verify.sh plan <issue> <ticket> <commit de plano>`) e apaga só a mensagem proposta, que virou a mensagem do commit e aparece na íntegra na página. A página fica na pasta do ticket, fora do versionamento, e a linha de origem dela cita o commit de plano. Um plano refeito a sobrescreve, como sobrescreve a mensagem. A página vale para o commit que ela cita: depois de um rebase, ou de um aceite descongelado e corrigido, monte-a de novo a partir do commit atual. Como a pasta é ignorada pelo Git, pode ser apagada a qualquer momento |

- **Testes do script da página:** `scripts/test/plan-page.test.sh` testa o `--pai` obrigatório e validado, a página gravada na pasta do ticket e as regras do `.gitignore` na profundidade da pasta do ticket, num repositório temporário. Roda na máquina, porque o script usa o `git` e o `bash`, que o contêiner `api` não tem, e faz parte do passo "Testes do harness".
- **Por que uma página, e não um arquivo de texto:** juntar tudo num arquivo só troca o lugar do problema. As abas deixam ver cada parte sozinha.
- **Por que estática:** a página é lida, e não editada. Um comentário salvo nela pediria um servidor e um lugar para guardar, e o chat já faz esse papel.
- **Por que genérica:** é um arquivo HTML, e cada agente o apresenta pelo meio que tiver (publicar, abrir no navegador, anexar). Nada nela depende da ferramenta de um agente.
- **Por que a montagem, e não um empacotamento:** até o LUI-176, o comando do Node levava os arquivos ao contêiner num `tar`, pela entrada padrão, numa pasta recriada a cada chamada em `reports/` da API, e decidia, por uma regra própria, quais argumentos eram arquivos a levar. Com o repositório montado, o Node lê os arquivos onde eles estão: sem cópia, sem pasta temporária e sem regra para manter. A montagem é só leitura para nenhum script do harness alterar o repositório pelo contêiner. O `.git` fica coberto por uma pasta vazia (um `tmpfs` só leitura), porque nada no contêiner usa o Git: o histórico, os hooks e a configuração do repositório ficam fora do alcance do que roda nele.
- **Limite:** o comando do Node deste projeto só enxerga o que está dentro do repositório, então a skill de plano precisa estar nele para rodar por esse comando.
- **Limite:** a pasta vazia sobre o `.git` pede que ele seja uma pasta. Num checkout em que o `.git` é um arquivo, como um worktree do Git, o serviço `api` não sobe a partir dele.
- **Por que portável:** a skill de plano vive na pasta dela, com os formatos e os scripts, e fala com o projeto só pelos argumentos do script da página e pelos dois comandos. Copiada para outro repositório, roda com o `node` da máquina e o contrato `nenhum`, sem Docker. O que é deste projeto (os valores, o atalho, os donos do contrato e os detalhes de cada item do formato no LLD) fica nele.
- **Testes:** o construtor e o parser, nos testes da skill e nos de aceite deste projeto, e o renderizador do contrato estão nos testes do harness (seção "Aceite"). O script da página depende do `git` e dos comandos do projeto e foi demonstrado nos PRs do LUI-173, do LUI-174, do LUI-175, que mostrou a mesma página antes e depois da mudança e a skill num repositório sem Docker, e do LUI-176, que mostrou a mesma página com o repositório montado e as fontes pela entrada padrão.
- **Fora:** o texto do critério no Linear (o script não lê o Linear sem um segredo; a comparação continua com o revisor e com o humano no merge) e qualquer interatividade além das abas.

### Etapa 8: contrato e schema conferidos por máquina

Implementada. O contrato e o schema das tabelas e rotas que já existem passaram a ter dono máquina-conferível. O LLD continua dono das convenções, das regras e do que ainda não existe.

| Peça | Dono depois da etapa | Conferência |
| --- | --- | --- |
| Contrato da API | Uma OpenAPI gerada do NestJS pelo `@nestjs/swagger`, cujo plugin lê os DTOs do `class-validator`, com o snapshot versionado na pasta da API. A seção 3 do LLD fica com as convenções e aponta para ele | O snapshot gerado do código tem de ser igual ao commitado (`oasdiff diff --fail-on-diff`, ignorando descrições e exemplos), e a mudança não pode quebrar o contrato da `main` (`oasdiff breaking --fail-on ERR`) |
| Schema do banco | O `schema.prisma`, nas tabelas implementadas, com as observações de coluna em comentários `///`. A seção 2 do LLD fica com as convenções, o diagrama, as regras que não cabem numa coluna e as tabelas ainda não implementadas | O passo "API: schema com a migração correspondente" aplica as migrações no banco do ambiente e reprova se o `prisma migrate diff --from-config-datasource --to-schema --exit-code` encontrar diferença |

- **Por que gerada, e não escrita à mão:** um contrato escrito à mão, comparado com um gerado, acusa diferença até em descrição. Com o snapshot gerado como dono, o commit de plano escreve nele o delta planejado, e a comparação entre o snapshot do plano e o final mostra onde o contrato saiu diferente do planejado.
- **Custo:** o plugin infere a entrada pelos DTOs, mas as respostas, inclusive os erros de cada rota, pedem tipo de retorno ou decorators.
- **Como a igualdade ignora o texto:** `--exclude-elements description,examples,summary`, no `oasdiff` v1.33.0 (imagem fixada em `scripts/verify/api.sh`). Uma diferença só de descrição não reprova, e uma resposta a menos reprova.
- **Sem banco sombra:** no Prisma 7, comparar as migrações com o schema pede um banco sombra, configurado no `prisma.config.ts`. O passo evita isso comparando o banco do ambiente, já com as migrações aplicadas, com o schema.
- **Primeira adoção:** o portão de quebra compara o snapshot com o da base e, sem snapshot na base, passa dizendo que não há o que comparar. A partir do merge desta mudança, ele vale.
- **Onde estão os passos:** `api_contract`, em `scripts/verify/api.sh`, dentro do grupo completo da API. O snapshot é gerado por `pnpm openapi:generate <arquivo>`, que compila com o plugin do `@nestjs/swagger` num diretório à parte, sem mexer no `dist` do servidor de desenvolvimento.
- **O que o snapshot descreve:** entrada (pelos DTOs), resposta de sucesso e erros de cada rota, como `application/problem+json` (decorator `ApiProblem`). Não descreve as regras do `class-validator` escritas em decorators próprios, como o formato do e-mail: o plugin só lê os decorators padrão.
- **Limite:** a conferência prova que o snapshot bate com o código, e não que o código implementa o contrato do LLD. Os testes de ponta a ponta e o revisor cobrem isso.

#### Visão do contrato e desvio do plano

O commit de plano escreve o delta do contrato no snapshot, que é um JSON difícil de revisar, e nada conferia se o contrato implementado é o planejado: o implementador podia regenerar o snapshot com outro desenho e a verificação aprovava. A visão legível resolve a leitura, e o aviso de desvio, a conferência.

| Peça | Como é |
| --- | --- |
| Visão | `scripts/verify.sh contract [<de> [<para>]]`, que chama o `api_contract_view` do `scripts/verify/api.sh`. Junta três coisas entre os dois pontos (commits, ou a árvore do índice), em Markdown, no formato de saída do comando do contrato da skill de plano: na seção `# Contrato`, o `oasdiff changelog` (o que mudou, com a severidade de cada mudança) e o contrato completo de cada rota nova ou alterada, no formato da seção 3 do LLD; na seção `# Schema`, o diff do `schema.prisma`. É o comando do contrato que este projeto declara para a skill. Sem `<para>`, o segundo ponto é a pasta de trabalho. Com o snapshot igual nos dois pontos, diz que o contrato não muda, sem rodar o `oasdiff`. Não é versionada, nem na mensagem do commit: é gerada na hora |
| Renderizador | O `scripts/contract-view.cjs` monta o modelo das rotas que mudaram (`routeChanges`), com os `$ref` resolvidos, e o escreve em Markdown (`render`, que a visão inteira chama): uma seção por rota, ou a nota de vazio de que o contrato não muda, cujo título traz o método, o caminho, se ela é nova, alterada ou removida e se é protegida, com tabelas de parâmetros, de cabeçalhos de entrada, de cabeçalhos de resposta e de erros (status e `code`), e os campos do corpo e da resposta numa lista aninhada. A página de revisão do plano (etapa 7) mostra esse mesmo Markdown, escrito em HTML. Roda no contêiner `api` e recebe pela entrada padrão (etapa 7, linha "Comando do Node") as fontes que o `api_contract_sources` junta numa pasta temporária fora do repositório (os dois snapshots, o changelog e o diff do schema). Uma rota conta como alterada quando a operação dela, com os `$ref` resolvidos e sem descrições, resumos e exemplos, muda, mesmo que a mudança não apareça no texto renderizado (o changelog do `oasdiff` a detalha). Uma rota que não mudou não aparece |
| Snapshot ilegível | O `oasdiff` não lê o JSON, e o comando sai com 1, com a saída dele e o que corrigir. Na parada da `/plan-ticket`, isso pega o JSON escrito à mão antes do commit de plano |
| Na aprovação | A aba "Contrato" da página de revisão do plano (etapa 7) mostra a visão do `HEAD` até a pasta de trabalho, ao lado das abas do aceite e do schema |
| Commit de plano | O commit da branch (de `HEAD` até a base) que criou o arquivo de aceite citado na seção `## Aceite` do corpo do PR; se mais de um o criou, o mais recente, que é o plano em vigor. O arquivo citado é lido pelo próprio conferidor do aceite (`scripts/check-acceptance.cjs --cited`), e o commit, pelo `git log` da branch, que segue o arquivo pelas renomeações (`plan_commit`, no `verify.sh`). Se o `git log` falha, o passo diz isso e como corrigir |
| Desvio | No modo completo, depois do passo "Aceite", se o contrato ou o schema da pasta de trabalho é diferente do commit de plano, o passo "Contrato e schema contra o commit de plano" (`api_contract_drift`, no `scripts/verify/api.sh`) mostra a visão entre os dois, grava-a em `docs/tickets/<issue>/<ticket>/contract-drift.txt`, na pasta do ticket do arquivo de aceite citado (etapa 7), e emite `::warning title=Contrato diferente do planejado::`, que vira aviso no PR. O contrato é comparado como na igualdade com o código (`oasdiff diff`, ignorando descrições, resumos e exemplos), e o schema, pelo `git diff`. Se a visão não pôde ser montada, o arquivo e o aviso dizem isso. Sem desvio, diz que estão iguais ao planejado. Sem corpo, com "nenhum" ou com um arquivo de aceite criado fora da branch, diz que não há commit de plano para comparar. O passo nunca falha, e o modo completo apaga os `contract-drift.txt` de todas as pastas de ticket no começo, para não sobrar o de uma execução interrompida |
| Na CI | Num pull request, o checkout é o merge da branch na `main`, e as mudanças da `main` pareceriam desvio. A CI aponta o último commit da branch na variável `HARNESS_HEAD_REF`, e o desvio compara o commit de plano com ele; sem a variável, como na máquina, compara com a pasta de trabalho |
| Revisor | Recebe a visão do commit de plano até a pasta de trabalho, gerada pelo `scripts/verify.sh contract <commit de plano>` antes do `full`, no mesmo `contract-drift.txt` da pasta do ticket, como em "Revisor de conformidade". O `full` que vem depois o apaga e só o grava de novo se houver desvio, para o aviso |

- **Por que um renderizador próprio:** numa rota nova, o `oasdiff changelog` só diz que ela foi acrescentada, sem parâmetros, corpo, cabeçalhos nem erros. Ele detalha bem as rotas alteradas, e por isso a visão mostra os dois.
- **Por que aviso, e não bloqueio:** desvio legítimo acontece no ciclo da `tdd`, como um erro que só aparece ao escrever o teste. A decisão é do humano no merge, com o achado do revisor.
- **Por que só a branch:** um arquivo de aceite de um ticket já integrado levaria a um commit de plano antigo, e o aviso mostraria todo o contrato que mudou desde então.
- **Testes:** o renderizador e a leitura do arquivo citado no corpo do PR estão nos testes do harness (seção "Aceite"). O resto depende do `git` e do `oasdiff`, não bloqueia nada e foi demonstrado no PR do LUI-172.
- **Os formatos:** a skill de plano define o que toda rota e toda tabela planejadas trazem (`formatos/contrato.md`), e o `docs/lld.md` diz como cada item se escreve no snapshot (seção 3) e no schema (seção 2). A `/plan-ticket` os segue, e o revisor confere o delta contra eles.
- **Limite:** a visão mostra o que mudou entre o plano e o fim da branch, e não se o plano estava certo. Isso continua com a aprovação humana do plano.

## O que ficou de fora

| Peça | Por quê |
| --- | --- |
| Suítes de unidade e de integração da API no hook de fim de turno | Levam cinco segundos juntas e mostrariam o teste quebrado no mesmo turno. Ficam como evolução: com o bloqueio no push, o teste quebrado já não chega à CI. O sinal para trazê-las é o agente chegar várias vezes ao push com teste quebrado. |
| Mutation testing | Custo alto para o escopo didático. É a resposta conhecida para asserção fraca, e a primeira evolução a considerar. |
| Piso de cobertura | Cobertura mede execução, e não verificação. |
| Revisor com poder de bloqueio | Exige calibrar o revisor com tarefas antigas, e o projeto ainda não tem histórico para isso. |
| Revisor na CI | Pede uma chave de API como segredo num repositório público. Como ele não bloqueia, rodar na máquina entrega o mesmo relatório. |
| Credencial própria para o agente | Fecharia de vez o merge pelo agente, mas é excessivo para o escopo. |
| Sensores contínuos (deriva, código morto, sinais de produção) | O projeto não tem ambiente de produção nem volume de código que os justifique. |
| Limite forçado de rodadas de correção na CI | Fica como regra no `AGENTS.md`, sem mecanismo. Na máquina, a trava do modo completo cobre a mesma reprovação repetida ("Trava das reprovações repetidas"). |
| Lint do snapshot da OpenAPI (conferir por máquina que cada rota traz os itens do formato da seção 3 do LLD) | Muitos itens dependem do que a rota faz: um cabeçalho que ela lê ou um erro que ela devolve não aparecem no snapshot quando faltam, então um lint só pegaria o que é sempre exigido, como o `unauthenticated` da rota protegida. Por ora, quem confere é o revisor. O sinal para trazê-lo é o revisor apontar a mesma omissão de formato em mais de um ticket. |
