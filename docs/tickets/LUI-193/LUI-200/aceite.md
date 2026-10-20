# Aceite do LUI-200

Ticket de texto de skill, sem script, hook nem teste novo: o `/worktree` ganha o `SKILL.md`, que é o roteador dos cinco modos, e dois arquivos de passo a passo, um por modo (`modos/abrir.md` e `modos/sincronizar.md`), lidos só quando o modo roda. Ele absorve a `/abrir-frentes` e a `/sincronizar`, que saem com os arquivos delas. Cinco critérios são de documento, provados pela leitura do texto e pela busca de padrões nele; o sexto é de revisão humana, com evidência no pull request. Por isso não há teste previsto, nem mapa de testes, e o `tdd` não entra na implementação.

Decisões que os cenários supõem:

- Os arquivos dos modos se chamam `modos/abrir.md` e `modos/sincronizar.md`, dentro da pasta da skill. O `SKILL.md` do `/worktree` não leva `disable-model-invocation`, porque a `/implement` chama o modo `sincronizar`; a espera pela confirmação do `abrir` está no texto do modo, e não na invocação.
- O passo 0 do `/worktree` lê os valores do projeto na forma da `/plan-ticket`: uma tabela com o valor, o padrão e onde é usado, a frase de dizer no chat quais vieram do padrão e a regra de que `nenhum` pula o passo. Os valores são a base, o comando das frentes, o limite, o arquivo dos pontos de convergência, os status, o tipo da branch, os cinco comandos do passo de ambiente da sincronização e a verificação completa, que não tem padrão e é perguntada.
- Os comandos do passo de ambiente (atualizar o ambiente, recriar o banco, gerar uma migração, subir as aplicações e regenerar cada arquivo gerado) moram no texto da `/ambiente`, que é a dona do ambiente deste projeto; a lista "Valores das skills do ticket" do `AGENTS.md` aponta para eles pelo nome da seção, sem repeti-los.
- A avaliação do CA6 usa subagentes novos, que recebem só o texto da skill e a tarefa; o texto antigo das duas skills, para a comparação, vem do histórico do Git.

## LUI-200-CA1

**Marca:** documento

**Cenário:** Dado o `SKILL.md` do `/worktree`, quando se lê, então os cinco modos (`novo`, `listar`, `remover`, `abrir` e `sincronizar`) aparecem, cada um com quando usar; o `novo`, o `listar` e o `remover` mandam chamar o núcleo pelo valor do comando das frentes; o `abrir` e o `sincronizar` mandam ler o arquivo do modo, e os dois arquivos existem na pasta `modos/` com o passo a passo, que o `SKILL.md` não repete.

## LUI-200-CA2

**Marca:** documento

**Cenário:** Dado o arquivo do modo `abrir`, quando se lê, então o passo que mostra a proposta e espera a confirmação da pessoa vem antes do passo que cria a primeira frente, e o texto diz que nenhuma frente se cria sem a resposta dela, também quando o modelo chamou a skill; e a lista do que o modo nunca faz traz o abandono de uma frente, o `remover` e a edição à mão do que o núcleo recusa.

## LUI-200-CA3

**Marca:** documento

**Cenário:** Dado o arquivo do modo `sincronizar`, quando se lê o passo de ambiente, então ele traz a ordem (recriar o banco se uma migração mudou de nome, atualizar o ambiente, gerar a migração descartada, subir as aplicações e regenerar cada arquivo gerado), com cada comando como um valor do projeto e o `nenhum` pulando o passo; a regra das migrações vale para ferramenta que as aplica pela ordem do nome, com o nome novo no formato dos que já existem e a hora em UTC quando o nome tem data; e a regra do tipo `gerado` manda o agente perguntar, em vez de resolver à mão, quando o arquivo gerado entra em conflito e o projeto não declarou o comando que o regenera.

## LUI-200-CA4

**Marca:** documento

**Cenário:** Dado o repositório, quando se lista a pasta das skills e se busca o nome das duas que saíram, então não há `abrir-frentes` nem `sincronizar` (com os `agents/openai.yaml` delas); a `/implement` manda chamar o modo `sincronizar` do `/worktree` no passo de trazer a base e o modo `remover`, só a pedido, no passo de entregar; a seção "Frentes paralelas" do `AGENTS.md` fala do `/worktree` e dos cinco modos; e nenhum outro texto do projeto, fora das pastas de ticket, manda chamar uma das duas skills que saíram.

## LUI-200-CA5

**Marca:** documento

**Cenário:** Dado o texto do `/worktree` (o `SKILL.md` e os dois arquivos dos modos), quando se busca nele um caminho deste projeto, um comando da stack (o gerenciador de pacotes, o Docker, o Compose, o Prisma), um identificador do time, o nome do arquivo de instruções do projeto ou de uma seção dele e um exemplo de spec deste projeto, então nada é achado, e o passo 0 lê os valores com o padrão de cada um; e a lista "Valores das skills do ticket" do `AGENTS.md` traz as entradas do `/worktree`, com o comando das frentes e o ambiente apontando para o atalho e para a `/ambiente` deste projeto.

## LUI-200-CA6

**Marca:** revisão humana

**Cenário:** Dado o `/worktree` em dois sandboxes, quando um subagente novo, que recebe só o texto da skill e a tarefa, a roda em cada um, então, num repositório de fora, com só o Git (sem arquivo de instruções do projeto, sem Compose, sem documentos), ele anuncia os valores que vieram do padrão, pergunta a verificação completa, e cria, lista e remove uma frente pelo núcleo e sincroniza uma frente com a base sem mandar rodar nada que não existe lá; e, neste projeto, as mesmas tarefas que se davam à `/abrir-frentes` e à `/sincronizar` (tomadas do texto antigo, no histórico do Git) terminam com os mesmos passos, as mesmas paradas e o mesmo relatório, sem regressão. A pessoa lê no pull request o resumo das duas avaliações e as saídas.
