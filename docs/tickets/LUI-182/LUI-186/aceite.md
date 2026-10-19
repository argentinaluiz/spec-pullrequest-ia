# Aceite do LUI-186

Ticket de harness: o script de frentes (`scripts/frentes.sh`) monta e desmonta frentes, e o hook de antes do comando nega o `--forcar` ao agente. O CA1 a CA8 são provados por testes de unidade em shell, que rodam na máquina e entram no relatório dos testes em shell com a tag `@LUI-186-CA<n>`. O CA9 exige duas frentes de verdade com sessões de navegador, e é de revisão humana, com a evidência no PR. O CA10 é lido no diff.

O seam é a linha de comando do script, com repositórios temporários: um remoto (bare) com a `main`, e um clone dele que faz de checkout principal. O script roda com o `HARNESS_TEST=1`, o modo de teste do harness (o mesmo ponto de troca que o hook de fim de turno usa), que liga três substitutos e nada mais: o `docker` (um programa que só registra o que recebeu), o `gh` (um programa que devolve o estado de PR que o teste combinou) e a sonda de portas (um programa que diz quem ocupa uma porta). As conferências de pasta, branch, `.env`, `git worktree` e `flock` rodam de verdade, no Git e no sistema de arquivos temporários.

A base da frente é a `HARNESS_BASE_REF` do `scripts/verify.sh` (`origin/main` por padrão, ou o que a pessoa apontou, como `test/main`): o remoto é o que vem antes da barra, e a `main`, o que vem depois. O `.env` que o `novo` grava é o contrato da LLD (seção 6, "Ambiente local por slot"), com a máscara do `.git` por arquivo, porque toda frente criada pelo script é um worktree.

## LUI-186-CA1

**Marca:** teste de unidade

**Cenário:** Dado o checkout principal na `main`, sem nenhuma frente, quando se roda `frentes.sh novo LUI-186`, então o script busca a `main` do remoto, cria a pasta irmã `<principal>-lui-186` e a branch `feature/lui-186` a partir da `main` recém-buscada (e não da do clone, que está atrás), grava nela o `.env` do slot 1 (`SLOT=1`, as portas 3010, 3011, 4453 e 8035, os três endereços do slot e a máscara do `.git` por arquivo), chama o `docker compose up -d --build --wait` nessa pasta e imprime o comando para abrir a sessão nela. Com o tipo dado (`bugfix`), a branch é `bugfix/lui-186`. Com o slot 1 já ocupado por outra frente, o `.env` novo é o do slot 2.

**Teste previsto:** testes dos scripts do harness, `scripts/test/frentes.test.sh`, "o novo cria a pasta e a branch a partir da main buscada, grava o .env do menor slot livre, sobe o ambiente e imprime o comando de abrir a sessão".

## LUI-186-CA2

**Marca:** teste de unidade

**Cenário:** Dado o checkout principal numa branch que não é a `main`, com duas frentes em worktrees, quando se roda `frentes.sh novo`, então o script recusa a quarta frente, diz o limite, imprime a lista das frentes abertas (a mesma do `listar`) e não cria pasta, branch nem `.env`. Com o principal na `main` e as mesmas duas frentes, a terceira é criada. O limite se ajusta pela variável `FRENTES_LIMITE`.

**Teste previsto:** testes dos scripts do harness, `scripts/test/frentes.test.sh`, "o novo recusa a quarta frente, contando o principal fora da main, e mostra as abertas".

## LUI-186-CA3

**Marca:** teste de unidade

**Cenário:** Dado o checkout principal na `main`, quando dois `frentes.sh novo` rodam ao mesmo tempo, com o `docker` de teste lento para abrir a janela da disputa, então um recebe o slot 1 e o outro o slot 2, os dois `.env` são diferentes, e as duas frentes existem.

**Teste previsto:** testes dos scripts do harness, `scripts/test/frentes.test.sh`, "duas criações ao mesmo tempo recebem slots diferentes".

## LUI-186-CA4

**Marca:** teste de unidade

**Cenário:** Dado que a sonda de portas diz que a 3010 (a web do slot 1) está ocupada por um processo, quando se roda `frentes.sh novo`, então o script recusa o slot, diz a porta e o processo que a ocupa, e não cria pasta, branch nem `.env`; com a ocupada de outro slot (a do slot 2), o slot 1 serve.

**Teste previsto:** testes dos scripts do harness, `scripts/test/frentes.test.sh`, "o novo recusa o slot com porta ocupada, dizendo o processo".

## LUI-186-CA5

**Marca:** teste de unidade

**Cenário:** Dado o principal numa branch que não é a `main` e duas frentes em worktrees, uma com PR aberto e outra com PR mergeado, quando se roda `frentes.sh listar`, então cada linha traz a pasta, o slot (lido do `.env` da pasta, e 0 para o principal), a branch, as portas do slot e o estado do PR, e o principal aparece. Com o principal na `main`, ele não aparece. Uma branch sem PR mostra "sem PR".

**Teste previsto:** testes dos scripts do harness, `scripts/test/frentes.test.sh`, "o listar mostra slot, branch, portas e estado do PR de cada frente, com o principal quando ele é frente".

## LUI-186-CA6

**Marca:** teste de unidade

**Cenário:** Dado uma frente criada pelo `novo`, quando se roda `frentes.sh remover LUI-186` com o PR aberto, ou com o PR mergeado e a pasta com uma mudança sem commit ou um arquivo novo fora do `.gitignore`, então o script recusa, diz o que encontrou e não mexe em nada. Com o PR mergeado e a pasta limpa, chama o `docker compose down -v` na pasta, remove o worktree e apaga a branch local. O checkout principal nunca é removido, mesmo com o PR mergeado e a pasta limpa.

**Teste previsto:** testes dos scripts do harness, `scripts/test/frentes.test.sh`, "o remover recusa o PR não mergeado e a pasta suja, recusa o principal, e remove a frente mergeada e limpa".

## LUI-186-CA7

**Marca:** teste de unidade

**Cenário:** Dado uma frente com o PR aberto e a pasta suja, quando se roda `frentes.sh remover LUI-186 --forcar`, então o script a remove (derruba o ambiente com os volumes, remove o worktree e apaga a branch local). E, pela entrada JSON do hook de antes do comando, o `frentes.sh remover <ticket> --forcar` é negado ao agente (saída 2, com a razão), em qualquer posição da opção e embrulhado em `bash -c`, e o `frentes.sh remover <ticket>` sem a opção, o `novo` e o `listar` passam (saída 0).

**Teste previsto:** testes dos scripts do harness, `scripts/test/frentes.test.sh` ("o remover --forcar remove a frente sem merge") e `scripts/test/push-verify.test.sh` ("nega ao agente o remover --forcar e libera o remover sem ele").

## LUI-186-CA8

**Marca:** teste de unidade

**Cenário:** Dado um Git de uma versão abaixo da mínima (2.38), quando se roda qualquer comando do script (`novo`, `listar` ou `remover`), então ele recusa antes de mexer em qualquer coisa, diz a versão mínima e a que encontrou, e diz o que fazer (atualizar o Git). Com a versão mínima ou acima, segue.

**Teste previsto:** testes dos scripts do harness, `scripts/test/frentes.test.sh`, "o script recusa o Git abaixo da versão mínima, dizendo qual ela é".

## LUI-186-CA9

**Marca:** revisão humana

**Cenário:** Dado o checkout principal numa frente (numa branch que não é a `main`) e uma segunda frente criada pelo `frentes.sh novo`, quando as duas sobem, então as duas ficam no ar ao mesmo tempo, com as portas dos slots 0 e 1. Duas sessões do agente validam telas ao mesmo tempo pelo MCP de navegador, cada uma com o perfil isolado da instância, sem uma derrubar a outra. O `scripts/verify.sh full` da frente nova passa, e o `remover` a desmonta, com o ambiente dela derrubado e o do principal de pé. A evidência no PR traz o `novo` de verdade, o `listar`, o `remover` recusando e o que a pessoa observou nas duas sessões de navegador.

## LUI-186-CA10

**Marca:** documento

**Cenário:** Dado o diff do PR, quando se lê a seção "Frentes paralelas" do `AGENTS.md` da raiz, então ela diz o que é uma frente, o slot, o limite de três, os três comandos apontando para o cabeçalho do script, e a colisão de cookies no navegador da pessoa (um perfil do navegador por slot, porque as janelas anônimas da mesma sessão dividem os cookies); e o cabeçalho do `scripts/frentes.sh` descreve a fórmula do slot, o `.env`, as recusas, a remoção e o `--forcar` (que é só do humano), sem que um repita o outro.
