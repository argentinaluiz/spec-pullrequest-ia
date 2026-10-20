# Aceite do LUI-201

Ticket de harness e de texto de skill, o último da LUI-193: a `/implement` e a `tdd` passam a citar papéis, a pasta de scripts da raiz deixa de existir, e uma suíte do projeto impede que o kit volte a se prender. Os critérios de teste (CA1 a CA3) são da suíte, que mora na `/verificar` (uma skill do projeto), então os casos levam o ID na tag. O CA4 e o CA5 são de documento, provados pela leitura do texto e pela busca de padrões nele, e o CA6 é de revisão humana, com evidência no pull request.

Decisões que os cenários supõem:

- A suíte é um script da `/verificar`, `genericity.sh`, que recebe a lista do projeto e a pasta das skills, e o teste dela (`genericity.test.sh`) roda sobre skills de mentira, num repositório temporário, e sobre o kit de verdade. Como a verificação completa já acha e roda os testes de todas as skills, o teste do kit de verdade é o que põe a suíte no `full`.
- A lista do projeto é um arquivo da `/verificar`, `genericidade.txt`, com uma linha por skill genérica (`generica<TAB><skill>`) e uma por padrão (`padrao<TAB><expressão><TAB><descrição>`). Ela também entra na lista de arquivos protegidos como bloqueada, porque afrouxá-la desprotegeria o kit.
- A suíte varre o texto e os scripts das skills genéricas (o `SKILL.md`, os outros arquivos de texto, os scripts, os hooks e o `agents/`) e não varre as pastas `test/`, onde um caso pode precisar citar um caminho do projeto para provar uma negação.
- Uma referência de arquivo a outra skill é o caminho `skills/<outra>/` ou `../<outra>/` no texto de uma skill genérica, onde `<outra>` é qualquer outra pasta de skill. Chamar outra skill pelo nome (`/tdd`, "worktree") não é referência de arquivo.
- Os testes da página do plano que ainda moram na pasta de scripts da raiz vão para a `/plan-ticket` (que é a dona da página) e perdem o ID da tag; os critérios congelados que eles provavam (LUI-173, LUI-174, LUI-175 e LUI-196) são ligados pelos mapas de testes. O auxiliar de teste do contrato vai para a `/contrato`.

## LUI-201-CA1

**Marca:** teste de unidade

**Cenário:** Dado uma skill genérica de mentira com um arquivo de texto e um script que trazem, cada um, um padrão da lista do projeto, quando a suíte roda, então sai com erro e diz, para cada achado, a skill, o arquivo (com a linha) e o padrão; e uma skill genérica sem nenhum padrão, e uma skill do projeto que traz o padrão, não são reprovadas.

**Teste previsto:** testes dos scripts da skill `verificar`, `genericity.test.sh`, "a suíte reprova uma skill genérica que traz um padrão da lista do projeto, dizendo a skill, o arquivo e o padrão @LUI-201-CA1".

## LUI-201-CA2

**Marca:** teste de unidade

**Cenário:** Dado uma skill genérica que cita o caminho de um arquivo de outra skill genérica e outra que cita o de um arquivo de uma skill do projeto, quando a suíte roda, então reprova as duas, dizendo a skill, o arquivo e a skill referida; e uma skill genérica que só chama outra pelo nome, e uma que cita o caminho de um arquivo da própria pasta, passam.

**Teste previsto:** testes dos scripts da skill `verificar`, `genericity.test.sh`, "a suíte reprova uma skill genérica que carrega arquivo de outra skill genérica ou de uma skill do projeto, e libera a que chama outra pelo nome @LUI-201-CA2".

## LUI-201-CA3

**Marca:** teste de integração

**Cenário:** Dado o kit deste projeto (as skills genéricas da lista, com o texto, os scripts e os hooks) e a lista de padrões do projeto, quando a suíte roda sobre a pasta das skills de verdade, então o kit passa sem nenhum achado; e a suíte roda na verificação completa, porque o teste que a chama é um dos que a verificação acha nas skills.

**Teste previsto:** testes dos scripts da skill `verificar`, `genericity.test.sh`, "o kit deste projeto passa na suíte de genericidade, que roda na verificação completa @LUI-201-CA3".

## LUI-201-CA4

**Marca:** documento

**Cenário:** Dado o texto da `/implement` e o da `tdd`, quando se busca nele uma seção do arquivo de instruções do projeto citada pelo nome, um caminho deste projeto, um comando da verificação deste projeto e um identificador do time, então nada é achado; e o passo 0 da `/implement` lê os valores do projeto na forma da `/plan-ticket` (uma tabela com o valor, o padrão e onde é usado, a frase de dizer quais vieram do padrão e o `nenhum` pulando o passo), chama a verificação completa pelo valor, salva o corpo do pull request antes quando o comando o recebe, e diz ela mesma o mínimo de que cada passo depende (escalar a decisão de outro ticket, nunca fazer o merge, rodar a verificação completa uma vez, em segundo plano e nunca num subagente, e fazer o push só a pedido).

## LUI-201-CA5

**Marca:** documento

**Cenário:** Dado o repositório, quando se lista a raiz, então a pasta de scripts não existe; o `AGENTS.md` não cita caminho dela; e a seção das skills do ticket traz a regra "se ninguém invocar a skill, nada quebra", com as regras e os comandos de entrada no `AGENTS.md` e o que não pode falhar imposto por hook ou pela cadeia de skills. A lista "Valores das skills do ticket" traz as entradas da `/implement`.

## LUI-201-CA6

**Marca:** revisão humana

**Cenário:** Dado a `/implement` e a `tdd` em dois sandboxes, quando um subagente novo, que recebe só o texto da skill e a tarefa, as roda em cada um, então, num projeto de fora, com só o Git, a `/implement` anuncia os valores que vieram do padrão e pergunta só a verificação completa, e a `tdd` descreve os seams e o laço sem citar seção nenhuma; e, neste projeto, as mesmas tarefas dadas ao texto antigo (tomado do histórico do Git) terminam com os mesmos passos, as mesmas paradas e o mesmo relatório, sem regressão. A pessoa lê no pull request o resumo das duas avaliações.
