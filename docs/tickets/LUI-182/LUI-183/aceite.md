# Aceite do LUI-183

Ticket de preparação: faz os testes em shell do harness virarem prova de critério. Os CA1 a CA3 são provados por testes de unidade em shell, e o CA4, pela leitura do cabeçalho do auxiliar dos testes em shell.

Os testes em shell rodam na máquina, porque usam o `git` e o `jq`, e os do próprio ticket são em shell também: eles estão no relatório novo com a tag `@LUI-183-CA<n>`, o que prova o mecanismo por dentro. Cada teste prepara uma suíte de mentira (um script que carrega o auxiliar e roda um ou dois casos com um ID de mentira, `PROJ-9`) e a roda pelo executor novo, com o relatório numa pasta de `apps/api/reports/`. O contêiner `api` monta o repositório, então a pasta é a mesma para o conferidor, que roda no contêiner (`scripts/node-in-api.sh`) sobre um arquivo de aceite de mentira gravado ao lado do relatório. Assim o conferidor é o de verdade, o mesmo do `full`, e o teste não depende de como o relatório foi escrito, só de ele ser lido.

O relatório novo é um arquivo à parte do dos testes em Node, no mesmo formato, e entra no conferidor como mais um `vitest:<arquivo>`. O ID continua só na tag: o token `@<ticket>-CA<n>` fica no nome do caso e o relatório o repete em `tags`, como o repórter dos testes em Node faz.

## LUI-183-CA1

**Marca:** teste de unidade

**Cenário:** Dado um arquivo de aceite com o critério `PROJ-9-CA1` de teste de unidade e uma suíte em shell com um caso que passa e traz `@PROJ-9-CA1` no nome, quando o executor roda a suíte, então o relatório gravado traz esse caso com a tag `@PROJ-9-CA1` e o estado `passed`, o título continua como foi escrito, e o conferidor, lendo o relatório como `vitest`, sai com 0 e diz que `PROJ-9-CA1` está coberto por 1 teste.

**Teste previsto:** testes dos scripts do harness, `scripts/test/shell-tests.test.sh`, "o caso com o ID no nome sai no relatório com a tag e o conferidor o conta como coberto".

## LUI-183-CA2

**Marca:** teste de unidade

**Cenário:** Dado o mesmo arquivo de aceite e uma suíte em shell cujo caso com `@PROJ-9-CA1` no nome falha, quando o executor roda a suíte, então ele sai com 1, o relatório traz o caso com a tag e o estado `failed`, e o conferidor sai com 1 dizendo que um teste com o ID `PROJ-9-CA1` falhou. Dado uma suíte que termina com erro sem ter registrado nenhum caso que falhou, o relatório traz um caso `failed` que diz isso, e o executor sai com 1.

**Teste previsto:** testes dos scripts do harness, `scripts/test/shell-tests.test.sh`, "o caso que falha sai como failed e o conferidor reprova o critério" e "a suíte que termina com erro sem caso que falhou vira um caso que falhou".

## LUI-183-CA3

**Marca:** teste de unidade

**Cenário:** Dado o relatório de uma execução em que o caso com `@PROJ-9-CA1` passou, quando o executor roda de novo no mesmo caminho de relatório com uma suíte que não tem esse caso, então o relatório novo não traz a tag, e o conferidor sai com 1 dizendo que `PROJ-9-CA1` não tem nenhum teste.

**Teste previsto:** testes dos scripts do harness, `scripts/test/shell-tests.test.sh`, "o relatório de uma execução anterior não cobre o critério cujo caso não rodou agora".

## LUI-183-CA4

**Marca:** documento

**Cenário:** Dado o cabeçalho do auxiliar dos testes em shell, quando se lê o diff do PR, então ele diz como nomear um teste de aceite (o token `@<ticket>-CA<n>` no nome do caso, como no teste em Node) e onde fica o relatório (o caminho dentro de `apps/api/reports/`, apagado e regravado a cada execução do executor).
