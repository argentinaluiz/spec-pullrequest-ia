# Aceite do LUI-187

Ticket de harness: o `listar` do script de frentes ganha a coluna "conflita com" e a lista de conflitos, e a classificação dos pontos de convergência passa a ter um dono, um arquivo de dados que a `/sincronizar` lê. O CA1 e o CA2 são provados por testes de unidade em shell, que rodam na máquina e entram no relatório dos testes em shell com a tag `@LUI-187-CA<n>`. O CA3 é lido no diff.

O seam é a linha de comando do `scripts/frentes.sh listar`, com os mesmos repositórios temporários do LUI-186 (um remoto e um clone), mas com conflitos de verdade: as frentes são worktrees em branches com commits que mexem na mesma linha dos mesmos arquivos, e o `git merge-tree` roda de verdade. Só o `gh` e o `docker` continuam trocados pelo modo de teste do harness.

Os conflitos são calculados entre as pontas das branches, ou seja, com o que está em commit: o que ainda não foi commitado numa frente não entra. É o que os merges de verdade veriam. O `listar` busca a `main` do remoto da base antes de calcular, sem falhar se a rede faltar, e não muda a pasta, o índice nem as refs de nenhuma frente.

## LUI-187-CA1

**Marca:** teste de unidade

**Cenário:** Dado o checkout principal numa branch de ticket e duas frentes em worktrees, uma das quais mexe numa linha de um arquivo de código que a outra também muda, e uma terceira que não encosta em nada, e uma `main` do remoto que andou e mexe no mesmo arquivo da primeira, quando se roda `frentes.sh listar`, então a coluna "conflita com" de cada frente traz as frentes e a `main` com que ela conflita (e nada, quando não conflita), e uma seção de conflitos traz, para cada par que conflita e para cada frente que conflita com a `main`, os arquivos em conflito. Um par sem conflito não aparece na seção. O `listar` não muda nada: o estado e o índice de cada pasta, e o commit de cada branch, são os mesmos de antes.

**Teste previsto:** testes dos scripts do harness, `scripts/test/frentes.test.sh`, "o listar mostra, para cada par de frentes e para cada frente contra a main, se há conflito e em quais arquivos, sem mudar nada".

## LUI-187-CA2

**Marca:** teste de unidade

**Cenário:** Dado duas frentes que conflitam em dois arquivos, o snapshot da OpenAPI (ponto de convergência gerado) e um arquivo de código, e em outro par em um documento (a LLD), quando se roda `frentes.sh listar`, então o snapshot aparece à parte, no grupo dos pontos de convergência com regra mecânica e com o tipo dele (gerado), o arquivo de código aparece no grupo dos que pedem atenção, e o documento aparece também entre os que pedem atenção, com o tipo dele (documentos), porque só os três primeiros tipos (gerado, migrações e registros) têm regra mecânica. Os quatro tipos e os arquivos de cada um vêm do arquivo de classificação, e um arquivo de migração (pasta de migrações) e um de registro (o módulo raiz da API) são classificados por ele.

**Teste previsto:** testes dos scripts do harness, `scripts/test/frentes.test.sh`, "o conflito em ponto de convergência com regra mecânica aparece à parte, com o tipo, e o de código e o de documento pedem atenção".

## LUI-187-CA3

**Marca:** documento

**Cenário:** Dado o diff do PR, quando se lê o cabeçalho do `scripts/frentes.sh` e o arquivo de classificação dos pontos de convergência, então o cabeçalho descreve a coluna de conflitos (entre as pontas em commit, contra a `main` do remoto da base, só leitura) e a classificação, e o arquivo de dados traz os quatro tipos com os arquivos de cada um, que são o dono único da classificação: o `scripts/frentes.sh` o lê, e a `/sincronizar` o lerá para resolver, sem repetir a lista.
