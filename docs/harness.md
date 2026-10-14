# Harness — verificação do trabalho dos agentes

Este documento é dono do desenho do harness: que controles existem, o que cada um decide, o que ficou de fora e por quê. As regras que o agente segue a cada tarefa ficam no `AGENTS.md` da raiz, que aponta para cá.

O projeto é uma referência didática que precisa funcionar de verdade. Por isso o harness tem poucas peças, cada uma demonstrável e com o motivo escrito. A origem das decisões é a pesquisa "Verificação e harness para agentes de código: pesquisa consolidada", de 12 de outubro de 2026.

## Estado

| Etapa | Peça | Estado |
| --- | --- | --- |
| 1 | Script de verificação e CI | Implementado |
| 2 | Proteção da `main` e guarda do harness | Implementado. O ruleset está aplicado no repositório de teste, e ainda não no repositório principal |
| 3 | Hook de fim de turno | Implementado |
| 4 | Tabela de aceite | Implementado |
| 5 | Revisor em contexto novo | Implementado |
| 6 | Bloqueio no push | Implementado |

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
| Teste que falhou | Bloqueia | 1 |
| Suíte sem nenhum teste executado | Bloqueia | 1 |
| Teste pulado (`.skip`, `.only`, `.todo`, `.fixme`) | Bloqueia | 1 |
| Relatório de suíte ausente ou ilegível | Bloqueia | 1 |
| Build da web com erro | Bloqueia | 1 |
| Segredo nos commits da branch | Bloqueia | 1 |
| Teste no navegador que só passou na nova tentativa | Aviso no PR | 1 |
| PR que altera arquivo protegido do harness | Bloqueia | 2 |
| PR que altera configuração de lint ou de teste | Aviso no PR | 2 |
| Linha da tabela de aceite sem teste, com teste inexistente ou pulado | Bloqueia | 4 |
| PR que altera código em `apps/` sem tabela de aceite | Bloqueia | 4 |
| Achado do revisor | Comentário no PR | 5 |
| Push do agente com segredo nos commits da branch | Nega o push | 6 |
| Push do agente sem o modo completo aprovado para o último commit | Nega o push | 6 |

## Script de verificação

O `scripts/verify.sh` roda as verificações dentro dos contêineres do `compose.dev.yaml` e tem estes modos:

| Modo | O que roda | Quem chama |
| --- | --- | --- |
| `fast [app...]` | Tipos e lint das apps citadas, ou de todas | O hook de fim de turno |
| `full [--start-apps]` | O grupo completo de todas as apps, a tabela de aceite e a varredura de segredos. É o veredito, e grava a aprovação que o push exige | A CI, e o agente antes do push |
| `full <app>... [--start-apps]` | Só o grupo completo das apps citadas. Não confere a tabela nem os segredos e não grava aprovação | O agente, durante o desenvolvimento, se quiser |
| `prepush` | A varredura de segredos e a conferência de que o modo completo aprovou o último commit | O hook de antes do push |
| `apps` | A lista das apps registradas | O hook de fim de turno |

- **Códigos de saída:** 0 quando tudo passou, 1 quando alguma verificação falhou e 2 quando não deu para verificar (contêiner fora do ar, web ou API sem responder).
- **Relatórios:** cada suíte grava um JSON em `reports/`, na pasta do projeto, e o `scripts/check-report.cjs` o confere. O grupo completo de cada app apaga os relatórios antigos dela no começo, para que só valha a evidência da execução atual.
- **O `full` com apps não aprova nada.** Ele existe para o agente conferir uma app inteira sem pagar a outra, mas a suíte no navegador da web fala com a API real, e uma mudança só na API pode quebrá-la. Por isso o push e a CI continuam exigindo o `full` sem apps, e o `full` com apps termina avisando isso.
- **Web e API no ar:** a suíte no navegador depende das duas em modo de desenvolvimento. Na máquina, o script exige que elas já estejam respondendo. Com `--start-apps`, usado pela CI, ele mesmo as sobe.
- **Segredos:** o gitleaks, em versão fixa, olha os commits que a branch tem a mais do que a `origin/main`. A variável `HARNESS_BASE_REF` troca essa base. Num push na `main`, a CI a aponta para o commit anterior ao push, porque ali a `origin/main` já é o próprio commit enviado.

### Grupos por app

O `verify.sh` é o motor: os auxiliares, o despacho dos modos e o que atravessa as apps (tabela de aceite, segredos e aprovação). O que cada app verifica fica num arquivo dela, em `scripts/verify/<app>.sh`, que define três coisas:

| Nome | O que é |
| --- | --- |
| `<app>_fast` | Os passos rápidos da app, como tipos e lint |
| `<app>_full` | O grupo completo: chama o `<app>_fast` e acrescenta as suítes, o build e o que mais a app tiver |
| `<app>_reports` | Os relatórios das suítes que a tabela de aceite pode citar |

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
| `.oxlintrc.json`, `eslint.config.mjs`, `vitest*.ts`, `playwright.config.ts` e `tsconfig*.json` dos projetos | Aviso no PR |
| `package.json` dos projetos, com a seção `scripts` alterada | Bloqueia |
| `package.json` dos projetos, com outra mudança (dependências, por exemplo) | Aviso no PR |
| `Dockerfile.dev` dos projetos e o `compose.dev.yaml` | Aviso no PR |

- **Por que os scripts entram:** a CI chama o `scripts/verify.sh`. Um PR que o trocasse por um comando que sempre passa seria aprovado pelo próprio script trocado.
- **Arquivo renomeado:** o nome anterior também é conferido, para que mover um arquivo protegido conte como alterá-lo.
- **Lista vazia reprova:** se a API não devolver nenhum arquivo, o guarda sai com erro, em vez de aprovar sem ter conferido.
- **Consequência:** toda mudança no harness é reprovada pelo guarda e só entra por override do admin. Mexer nas regras vira sempre um ato humano registrado.
- **Espere o `Veredito` ficar verde antes do bypass.** O bypass pula todos os requisitos do ruleset, e não só o guarda: o GitHub aceita o merge com o `Veredito` ainda rodando ou reprovado. Num PR que altera o harness, o guarda reprova em segundos e o `Veredito` leva minutos, então o botão de bypass aparece antes de a verificação terminar. Quem garante que a mudança passou na CI, nesse caso, é o admin.
- **PR grande demais reprova:** a API do GitHub lista no máximo 3.000 arquivos por pull request. A partir desse total, um arquivo protegido poderia ficar fora da lista, então o guarda sai com erro.
- **Comandos do `pnpm`:** o `scripts/verify.sh` chama os comandos da seção `scripts` de cada `package.json`. Trocar `vitest run` por um comando que sempre passa enfraqueceria a verificação com os dois checks verdes. O guarda compara essa seção entre a `main` e o PR e bloqueia quando ela muda. O `package.json` do PR é baixado só para leitura, e nada dele é executado. Um `package.json` criado, apagado ou renomeado conta como mudança.
- **O que só avisa, e o risco disso:** o `compose.dev.yaml` e os `Dockerfile.dev` definem o ambiente em que a verificação roda, e as dependências do `package.json` definem as ferramentas. Um PR pode enfraquecer a verificação por eles, e os dois checks continuam verdes. Eles mudam em tarefas normais, e bloqueá-los tornaria o bypass rotineiro. O aviso no PR aponta a mudança, mas quem a lê e decide é o humano no merge: neste ponto, o controle é a leitura do diff, e não um bloqueio.

### Confirmação local

Editar ou criar um arquivo em `.github/**`, `.claude/settings.json`, `.claude/hooks/**`, `.claude/agents/**` e `scripts/**` pelas ferramentas de edição do agente pede a confirmação do humano, mesmo com o modo automático ligado. É a regra `ask` do `.claude/settings.json`. Ela não é `deny` porque mudanças legítimas no harness existem.

A regra não cobre o que o agente faz por comando de shell: um redirecionamento ou um script que grave nesses caminhos não passa por ela. Por isso ela é um aviso cedo para o caminho comum, e não uma garantia. A garantia é o guarda na CI, que confere o que chegou ao pull request, seja qual for o meio usado para escrever.

## Hook de fim de turno

A CI dá o veredito, mas leva minutos. O hook traz os checks rápidos para dentro do laço do agente, sem depender de ele lembrar da definição de pronto.

O `.claude/settings.json` registra o `.claude/hooks/stop-verify.sh` no evento `Stop` do Claude Code, que dispara quando o agente tenta encerrar o turno.

| Situação ao encerrar o turno | O que o hook faz |
| --- | --- |
| Nenhum código alterado nas apps registradas | Nada |
| Código alterado, igual ao da última verificação aprovada | Nada |
| Código alterado e ainda não verificado | Roda `scripts/verify.sh fast` nas apps alteradas |
| A verificação passa | Deixa o turno encerrar e guarda o estado aprovado |
| A verificação falha | Bloqueia o encerramento e devolve a saída ao agente, que continua |
| Os contêineres estão fora do ar | Bloqueia, com a instrução de subir o ambiente |
| A base da branch não é encontrada (falta a `origin/main` no clone) | Bloqueia, com a instrução de buscar a referência |
| A lista de apps não pode ser lida do script | Bloqueia |
| Três bloqueios seguidos na mesma sessão | Deixa o turno encerrar e mostra um aviso ao usuário |

- **Quais apps:** as do registro `APPS`, que o hook lê com `scripts/verify.sh apps`. Uma app nova entra no hook sem mexer nele.
- **O que conta como alterado:** a diferença entre a base da branch (o ponto em que ela saiu da `origin/main`) e a pasta de trabalho, mais os arquivos novos. Assim, o código que o agente commitou no mesmo turno também é verificado.
- **Por que guardar o estado aprovado:** numa branch com código alterado, um turno que só mexe em documento fora das apps não precisa pagar a verificação de novo. Um documento dentro da pasta de uma app, como o `AGENTS.md` dela, conta como mudança na app. O hook guarda um resumo do estado de cada projeto na pasta `.git`, fora do versionamento.
- **Falha fechada:** com código alterado e os contêineres fora do ar, o hook bloqueia, em vez de passar calado.
- **Limite de três bloqueios:** um erro que o agente não consegue corrigir viraria um laço sem fim. Depois do terceiro bloqueio seguido, o turno encerra e o usuário vê um aviso de que a verificação continua falhando. É o único ponto em que o hook deixa passar uma falha, e ela continua sendo pega pela CI.
- **Só o Claude Code:** outro agente não dispara este hook. Para ele, valem a instrução do `AGENTS.md` e a CI.
- **Fora:** hook a cada edição de arquivo (o código fica quebrado no meio de uma mudança, e o hook viraria ruído), suítes de teste no hook (lentas) e hook de Git (redundante com a CI e contornável com `--no-verify`).

## Tabela de aceite

A CI passar prova que os testes que existem passam. Não prova que cada critério de aceite tem um teste. A tabela de aceite fecha essa distância: o pull request declara qual teste cobre cada critério, e a CI confere a declaração.

O formato da tabela e a regra de quando escrevê-la estão no `AGENTS.md` da raiz, seção "Tabela de aceite no pull request".

| Situação | Efeito |
| --- | --- |
| O PR altera código em `apps/` e não tem a tabela | Bloqueia |
| A tabela não tem nenhuma linha | Bloqueia |
| Uma linha sem critério, sem arquivo ou sem nome de teste | Bloqueia |
| O arquivo citado não tem nenhum teste que rodou | Bloqueia |
| O teste citado não existe no arquivo | Bloqueia |
| O teste citado falhou ou foi pulado | Bloqueia |
| Falta o relatório de alguma suíte | Bloqueia |
| O PR não altera nada em `apps/` e não tem a tabela | Passa |

- **Onde é conferida:** no fim do `scripts/verify.sh full`, pelo `scripts/check-acceptance.cjs`, que lê os relatórios JSON das quatro suítes da própria execução. Faz parte do `Veredito`.
- **Quando é exigida:** quando o PR altera algum arquivo em `apps/`. O critério é o caminho, e não o nome da branch, que é o agente quem escolhe. Um PR só de documento fora de `apps/` ou de harness não precisa da tabela; se a trouxer, ela é conferida. Um documento dentro de `apps/`, como o `AGENTS.md` de um projeto, conta como mudança na aplicação.
- **Corpo editado, CI de novo:** a tabela mora no corpo do PR, então a CI roda outra vez quando ele é editado.
- **O que o humano confere no merge:** que as linhas da tabela são os critérios do ticket. A CI não lê o Linear, porque isso pediria um segredo de API no repositório.
- **Limite:** a tabela prova que o teste citado existe, rodou e passou. Não prova que ele verifica o critério: uma asserção fraca continua passando, e nada impede citar um teste que não tem relação com o critério. O que cobre isso é a leitura no merge e, como evolução, o mutation testing.

## Revisor em contexto novo

Os controles anteriores conferem fatos: o teste passou, o arquivo protegido mudou, o teste citado existe. Nenhum deles julga se a mudança resolve o problema certo nem se o teste prova o critério. Esse julgamento é do revisor.

O princípio é que quem faz não avalia. A separação é de papel, e não de modelo: o revisor roda no mesmo modelo, mas com outras instruções, outros insumos e sem permissão de escrita.

| Aspecto | Como é |
| --- | --- |
| Quem revisa | O subagente `revisor`, definido em `.claude/agents/revisor.md` |
| O que ele recebe | O arquivo de diff, com a mudança já em commit, e o identificador do ticket. Em PR sem ticket, os critérios de aceite no lugar dele. Nunca o resumo nem a opinião de quem implementou |
| O que ele pode fazer | Ler o repositório e o ticket. Não tem ferramenta de escrita nem de shell |
| O que ele confere | Se o diff entrega cada critério de aceite, se os testes provam os critérios, defeitos, regras do projeto e documentos desatualizados |
| Onde fica o resultado | Num comentário no PR, com cada achado marcado como corrigido ou não, o motivo e o relatório na íntegra |
| Efeito | Nenhum bloqueio. A CI não lê o comentário |

O passo a passo que o agente segue e o formato do comentário estão no `AGENTS.md` da raiz, seção "Revisão em contexto novo".

- **O que ele cobre que a CI não cobre:** a tabela de aceite prova que o teste citado existe e passou. O revisor lê as asserções e aponta o teste que passaria mesmo com o comportamento quebrado.
- **Por que não bloqueia:** o revisor é inferencial e não foi calibrado. O mesmo diff pode render achados diferentes em duas execuções, e ele pode apontar um defeito que não existe. Dar poder de bloqueio a isso trocaria um veredito reprodutível por um que não é.
- **Todo achado fica registrado,** inclusive o que o agente que implementou considera errado. Assim, a decisão sobre um achado não corrigido é do humano no merge, e não de quem escreveu o código.
- **A definição do revisor é arquivo do harness.** O `.claude/agents/` está entre os caminhos protegidos pelo guarda, porque enfraquecer as instruções do revisor enfraqueceria a revisão sem alterar nenhum check.
- **Limite:** este passo é uma instrução, e instrução pode ser pulada. A CI poderia reprovar o PR sem o comentário, mas isso daria poder de bloqueio a uma peça inferencial pela porta dos fundos. A falta do comentário aparece só para o humano, no merge.
- **Limite:** o diff só traz o que está em commit. Mudança que ficou fora do commit fica fora da revisão, e por isso o passo a passo exige a árvore de trabalho limpa antes de gerar o diff.
- **Limite:** o revisor não roda o código nem os testes. Ele lê. O que só aparece em execução fica para a CI.
- **Limite:** nenhum revisor pega bem um requisito mal entendido quando o ticket também está errado. A atenção humana continua necessária na fronteira entre especificar e implementar.

## Bloqueio no push

Rodar o modo completo antes de enviar o código era só uma regra do `AGENTS.md`, e controle que existe só como instrução é pulado. Quando o agente pulava, o erro aparecia minutos depois, numa rodada de CI. Esta etapa transforma a regra em mecanismo.

O `.claude/settings.json` registra o `.claude/hooks/push-verify.sh` no evento `PreToolUse` do Claude Code, para a ferramenta de shell. Quando o comando é um `git push`, o hook chama `scripts/verify.sh prepush` e nega o comando se ele não passar.

| Situação no push | O que o hook faz |
| --- | --- |
| Os commits da branch trazem um segredo | Nega |
| A branch não altera nada do que a verificação lê | Deixa passar, depois da varredura de segredos |
| O modo completo aprovou o conteúdo do último commit | Deixa passar |
| O modo completo não rodou, reprovou, ou aprovou outro conteúdo | Nega, com a instrução de rodar |
| A branch altera `apps/` e o modo completo aprovou sem conferir a tabela de aceite | Nega, com a instrução de rodar com o corpo do PR |
| A base da branch não é encontrada, ou a varredura não consegue rodar | Nega |
| O comando é um push sozinho que apaga uma branch remota (`--delete`) | Deixa passar, porque não envia código |
| O hook não consegue ler o comando, e a entrada cita `git` e `push` | Trata como push |

O passo a passo que o agente segue está no `AGENTS.md` da raiz, seção "Antes do push".

- **O bloqueio é no push porque é ele que gasta rodada de CI.** Toda execução da CI num pull request nasce de um push, na abertura e nas correções.
- **O que a aprovação cobre:** o conteúdo de `apps/`, do `compose.dev.yaml` e de `scripts/`, que é o que a verificação lê. O modo completo resume esse conteúdo no começo da execução e, se terminar aprovado, grava o resumo na pasta `.git`, fora do versionamento. O hook compara com o resumo do último commit.
- **Documento fora dos caminhos verificados não invalida a aprovação.** Tipos, lint, testes e build não mudam de resultado por causa de um documento, e exigir cinco minutos de verificação para um ajuste de texto levaria a contornar o bloqueio.
- **Documento dentro de `apps/` invalida.** A aprovação cobre a pasta inteira, sem distinguir código de texto, então mudar o `AGENTS.md` de um projeto pede o modo completo de novo.
- **A varredura de segredos roda em todo push,** inclusive no de documento. É a única verificação em que a CI chega tarde: quando ela reprova, o segredo já está no repositório remoto.
- **A tabela de aceite entra na aprovação.** Na máquina, o modo completo só confere a tabela quando recebe o corpo do PR num arquivo. Sem essa exigência, o mesmo comando aprovaria na máquina e reprovaria na CI.
- **Mudança sem commit conta para a tabela.** O modo completo costuma rodar antes do commit, então ele considera a pasta de trabalho, e não só os commits, para decidir se a tabela é exigida.
- **Sem exceção para o agente.** Não há variável nem argumento que desligue o bloqueio. O push sem verificação, como o de um trabalho pela metade, é do usuário, no terminal. Segue o desenho do merge e do bypass: o caminho fora da regra é um ato humano.
- **Limite:** o hook só vê o push que o agente faz por comando de shell. O push do usuário no terminal e um push feito pela API do GitHub não passam por ele. O bloqueio contém o esquecimento, e não a má-fé; a garantia continua sendo a CI.
- **Limite:** o hook reconhece o `git push` pelo texto do comando, quando ele está no começo de uma linha ou depois de `;`, `&`, `|` ou `(`. Um push embrulhado em outro programa, como `sh -c`, não é reconhecido. No sentido contrário, um texto que tenha `git push` no começo de uma linha, como o corpo de um PR, é conferido como se fosse um push.
- **Limite:** o hook confere o último commit da pasta do projeto. Um push de outra branch ou de outro repositório, feito no mesmo comando, é conferido contra esse commit.
- **Limite:** a aprovação fica na máquina. Em outro clone, ou depois de apagar a pasta `.git/harness`, o modo completo precisa rodar de novo.
- **Limite:** o hook confere o arquivo do corpo do PR que o agente apontou, e não o corpo que ele publica depois. Se os dois divergirem, a CI reprova.
- **Só o Claude Code:** outro agente não dispara este hook. Para ele, valem a instrução do `AGENTS.md` e a CI.

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
| Limite forçado de rodadas de correção | Fica como regra no `AGENTS.md`, sem mecanismo. |
