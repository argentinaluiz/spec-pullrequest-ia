# Aceite do LUI-191

Ticket de configuração fora do repositório, feita pelo humano, mais a documentação. O CA1 e o CA2 são de revisão humana: configurar o ruleset da `main` no GitHub e a integração do Linear com o GitHub é do usuário, e o agente não os configura. O CA3 é de documento, lido no diff. Não há teste de unidade, porque não há código, e o fluxo do ticket sem critério de teste não usa a `tdd`.

O que o agente faz neste ticket: a documentação do `AGENTS.md` da raiz (CA3), e manter o arquivo versionado do ruleset (`.github/rulesets/main.json`), que é a cópia declarativa que o usuário importa no GitHub, de acordo com o que o ticket pede. A conferência do ruleset já ativo e a evidência dos dois critérios humanos vão no PR.

## LUI-191-CA1

**Marca:** revisão humana

**Cenário:** Dado o repositório no GitHub, quando se lê o ruleset ativo da `main`, então ele exige o check `Veredito`, exige a branch atualizada com a `main` antes do merge (a política estrita dos checks obrigatórios), exige o check `Guarda do harness` e deixa o admin passar por cima dele nos PRs de harness (o bypass do admin via pull request), sem merge queue. A evidência no PR traz a leitura do ruleset ativo, campo a campo, contra isto.

## LUI-191-CA2

**Marca:** revisão humana

**Cenário:** Dado a integração do Linear com o GitHub ligada, quando se abre um PR de uma branch com o identificador do ticket, então o PR fica vinculado à issue e ela vai para "In Review", e quando o PR é mergeado a issue vai para "Done". Os tickets sem PR, como os de design, continuam com o "Done" manual. A evidência no PR traz o que o usuário observou numa issue de verdade.

## LUI-191-CA3

**Marca:** documento

**Cenário:** Dado o diff do PR, quando se lê o `AGENTS.md` da raiz, então a seção "Convenções de Git" diz o que o merge pede (o check `Veredito` verde, a `Guarda do harness`, que o usuário contorna como admin nos PRs de harness, e a branch atualizada com a `main`, que a `/sincronizar` traz), e a seção "Issues e tickets no Linear" diz que o "Done" vem do merge do PR e que o "In Review" vem da abertura dele, com os tickets sem PR com o "Done" manual.
