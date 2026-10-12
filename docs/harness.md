# Harness — verificação do trabalho dos agentes

Este documento é dono do desenho do harness: que controles existem, o que cada um decide, o que ficou de fora e por quê. As regras que o agente segue a cada tarefa ficam no `AGENTS.md` da raiz, que aponta para cá.

O projeto é uma referência didática que precisa funcionar de verdade. Por isso o harness tem poucas peças, cada uma demonstrável e com o motivo escrito. A origem das decisões é a pesquisa "Verificação e harness para agentes de código: pesquisa consolidada", de 12 de outubro de 2026.

## Estado

| Etapa | Peça | Estado |
| --- | --- | --- |
| 1 | Script de verificação e CI | Implementado |
| 2 | Proteção da `main` e guarda do harness | Ainda não implementado |
| 3 | Hook de fim de turno | Ainda não implementado |
| 4 | Tabela de aceite | Ainda não implementado |
| 5 | Revisor em contexto novo | Ainda não implementado |

As seções das etapas ainda não implementadas registram a decisão tomada. Cada uma é completada quando a etapa entra.

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
| PR sem tabela de aceite, fora das branches `docs/*` | Bloqueia | 4 |
| Achado do revisor | Comentário no PR | 5 |

## Script de verificação

O `scripts/verify.sh` roda as verificações dentro dos contêineres do `compose.dev.yaml` e tem dois modos:

| Modo | O que roda | Quem chama |
| --- | --- | --- |
| `fast [api] [web]` | Tipos e lint dos projetos citados | O hook de fim de turno (etapa 3) |
| `full [--start-apps]` | O modo rápido, as três suítes da API, o build da web, a suíte no navegador e a varredura de segredos | A CI, e o agente antes de concluir |

- **Códigos de saída:** 0 quando tudo passou, 1 quando alguma verificação falhou e 2 quando não deu para verificar (contêiner fora do ar, web ou API sem responder).
- **Relatórios:** cada suíte grava um JSON em `reports/`, na pasta do projeto, e o `scripts/check-report.cjs` o confere. Os relatórios antigos são apagados no começo, para que só valha a evidência da execução atual.
- **Web e API no ar:** a suíte no navegador depende das duas em modo de desenvolvimento. Na máquina, o script exige que elas já estejam respondendo. Com `--start-apps`, usado pela CI, ele mesmo as sobe.
- **Segredos:** o gitleaks, em versão fixa, olha os commits que a branch tem a mais do que a `origin/main`. A variável `HARNESS_BASE_REF` troca essa base.

## CI

O workflow `CI` roda em todo pull request e em todo push na `main`. O job `Veredito` sobe o `compose.dev.yaml` e chama `scripts/verify.sh full --start-apps`. É o único veredito do projeto: o resultado que o agente obtém na máquina não aprova nada.

- **Nova tentativa:** na CI, o teste no navegador que falha roda mais uma vez. Se passar, a suíte é aprovada e o teste aparece como aviso no PR. O aviso existe para que um defeito intermitente real não passe em silêncio.
- **Relatórios:** os JSON, o relatório HTML do Playwright e os traces ficam como artefato da execução.
- **Fora do veredito:** a formatação com o Prettier e a validação visual não são conferidas pela CI.

## Proteção da `main` e guarda do harness

Ainda não implementado. Decisão:

- **Ruleset na `main`:** pull request obrigatório, o check `Veredito` obrigatório, nenhuma aprovação exigida, sem push direto e sem force push. Não se exige aprovação porque o projeto tem um único humano, e o GitHub não deixa aprovar o próprio PR.
- **Override:** só o admin pula o ruleset, e só em PR. O registro do GitHub de quem pulou a regra é a trilha de override. Serve para o bloqueio por engano, como o de um teste instável.
- **O agente não faz merge.** O `.claude/settings.json` nega o `gh pr merge`. O agente usa a credencial do humano, então só essa regra garante que um merge foi um ato humano. Ela contém o erro, não a má-fé: o mesmo merge é possível pela API do GitHub.
- **Guarda do harness:** um segundo check obrigatório, que roda com a definição de workflow da `main`, e não a do PR. Ele reprova o PR que altera um workflow, o `.claude/settings.json` ou um hook. Sem ele, um PR poderia enfraquecer a CI e ser aprovado pela CI enfraquecida. A consequência é que toda mudança no harness entra por override do admin.
- **Confirmação local:** editar esses mesmos arquivos pede a confirmação do humano, mesmo no modo automático.
- **Fora do guarda:** as configurações de lint e de teste e os `AGENTS.md` mudam em tarefas normais. O guarda só anota um aviso quando as configurações mudam.

## Hook de fim de turno

Ainda não implementado. Decisão:

- **O que faz:** quando o agente encerra o turno com código alterado em `apps/api` ou `apps/web`, o hook roda o modo rápido do projeto alterado. Se falhar, a saída volta ao agente, que continua o trabalho.
- **Falha fechada:** com código alterado e os contêineres fora do ar, o hook bloqueia e diz para subir o ambiente. Sem alteração em `apps/`, ele não faz nada.
- **Fora:** hook a cada edição de arquivo (o código fica quebrado no meio de uma mudança, e o hook viraria ruído), suítes de teste no hook (lentas) e hook de Git (redundante com a CI e contornável com `--no-verify`).

## Tabela de aceite

Ainda não implementado. Decisão:

- **O que é:** uma tabela no corpo do PR, com uma linha por critério de aceite e, em cada linha, o arquivo e o nome do teste que o prova. Os critérios vêm do ticket ou, em PR sem ticket, do próprio PR.
- **O que a CI confere:** que cada teste citado existe, rodou e passou, pelos relatórios da própria execução.
- **O que o humano confere no merge:** que as linhas da tabela são os critérios do ticket. A CI não lê o Linear.
- **Limite:** a tabela prova que o teste citado passou, e não que ele verifica o critério. Uma asserção fraca continua passando.

## Revisor em contexto novo

Ainda não implementado. Decisão:

- **Quem revisa:** um subagente que não viu a implementação. Ele recebe o diff, o ticket e os documentos, e não tem permissão de escrita.
- **Onde fica o resultado:** num comentário no PR, com o que foi corrigido, o que foi deixado e o motivo. A CI não lê esse comentário.
- **Sem bloqueio:** o revisor não foi calibrado, então só anota. O que fazer com um achado não corrigido é decisão do humano no merge.

## O que ficou de fora

| Peça | Por quê |
| --- | --- |
| Mutation testing | Custo alto para o escopo didático. É a resposta conhecida para asserção fraca, e a primeira evolução a considerar. |
| Piso de cobertura | Cobertura mede execução, e não verificação. |
| Revisor com poder de bloqueio | Exige calibrar o revisor com tarefas antigas, e o projeto ainda não tem histórico para isso. |
| Revisor na CI | Pede uma chave de API como segredo num repositório público. Como ele não bloqueia, rodar na máquina entrega o mesmo relatório. |
| Credencial própria para o agente | Fecharia de vez o merge pelo agente, mas é excessivo para o escopo. |
| Sensores contínuos (deriva, código morto, sinais de produção) | O projeto não tem ambiente de produção nem volume de código que os justifique. |
| Limite forçado de rodadas de correção | Fica como regra no `AGENTS.md`, sem mecanismo. |
