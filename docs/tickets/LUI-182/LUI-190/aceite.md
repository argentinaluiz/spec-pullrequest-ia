# Aceite do LUI-190

Ticket de skill: a `implement` vira a skill de um ticket na frente, e a `implement-spec` sai do projeto. Os dois critérios são de documento, lidos no diff do PR, e nenhum exige teste: não há código, e o fluxo do ticket sem critério de teste não usa a `tdd`.

A `implement` já é, hoje, quase o fluxo de um ticket: ela começa do commit de plano e do arquivo de aceite, usa a `tdd`, a `/simplify`, a `/code-review` e a revisão de conformidade, roda o `full` e faz o commit. Faltam a `/sincronizar` antes do `full` e a regra de escalonamento. A `implement-spec` descreve um orquestrador com subagentes em worktrees, que quebra os hooks do harness (o `CLAUDE_PROJECT_DIR` não acompanha o worktree de um subagente) e não é o uso real: ela é chamada para um ticket só, na própria sessão. O modo orquestrador só volta junto com a adaptação dos hooks ao diretório do worktree, numa spec própria.

## LUI-190-CA1

**Marca:** documento

**Cenário:** Dado o diff do PR, quando se lê a `.claude/skills/implement/SKILL.md`, então ela descreve o fluxo de um ticket na própria sessão, na ordem: o commit de plano e o arquivo de aceite como ponto de partida (e parar para pedir a `/plan-ticket` se não há plano); a `tdd`, nos seams do plano e com o ID do critério numa tag do teste, ou a entrega de cada critério como o cenário descreve nos tickets sem critério de teste; só os testes ligados aos arquivos mudados durante o trabalho; a `/simplify`, a `/code-review` e a revisão de conformidade (esta só se a mudança altera código em `apps/`), com a triagem; a `/sincronizar`, **antes do `full`**; o `full` uma vez, em segundo plano, antes do commit que fecha o trabalho; e o commit na branch atual. Traz a regra de escalonamento: parar e perguntar diante de uma decisão que não está no ticket nem no plano e que outro ticket em andamento também tomaria, ou de mudar algo que outro ticket em andamento usa. E diz que não faz commit direto na `main`, nem merge de PR.

## LUI-190-CA2

**Marca:** documento

**Cenário:** Dado o diff do PR, quando se procura `implement-spec` nos documentos, nas skills e nas instruções do projeto (o `AGENTS.md` da raiz e os dos projetos, a LLD, o README, o `REVIEW.md`, as skills e o `skills-lock.json`), então a pasta `.claude/skills/implement-spec/` não existe mais, a entrada dela saiu do `skills-lock.json`, a `revisao-conformidade` não a cita (ela passa a falar do fluxo da `implement`), e a busca não acha nada. Ficam de fora só os registros do repositório que os agentes não leem: as transcrições de sessões e as cópias de specs.
