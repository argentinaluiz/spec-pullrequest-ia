# Aceite do LUI-192

Ticket de harness, de acabamento do que a LUI-182 entregou. O CA1 e o CA2 são provados por testes de unidade em shell, que rodam na máquina e entram no relatório dos testes em shell com a tag `@LUI-192-CA<n>`. O CA3 é lido no diff, nos arquivos de classificação e na skill.

O LUI-192 não é filho de nenhuma spec no Linear; a pasta dele fica sob a LUI-182, de onde os achados vieram.

O seam do CA1 é a leitura da base pelos dois scripts: o teste carrega o arquivo compartilhado em shells separados, com e sem `HARNESS_BASE_REF`, e confere por leitura do código que o `frentes.sh` e o `verify.sh` o carregam e que nenhum dos dois define o padrão por conta própria. O seam do CA2 é a linha de comando do `frentes.sh listar`, com os repositórios temporários e os substitutos do modo de teste do harness que a suíte do `frentes.sh` já usa.

## LUI-192-CA1

**Marca:** teste de unidade

**Cenário:** Dado o arquivo compartilhado da base, quando se carrega sem `HARNESS_BASE_REF`, então a base é `origin/main`, com o remoto `origin` e a branch principal `main`. Com `HARNESS_BASE_REF=test/main`, o remoto é `test` e a branch é `main`. Com uma branch com barra (`origin/release/1`), o remoto é `origin` e a branch é `release/1`. E, lido o código dos dois scripts, o `frentes.sh` e o `verify.sh` carregam esse arquivo e nenhum dos dois define o padrão da base, de modo que mudar o padrão no arquivo muda nos dois.

**Teste previsto:** testes dos scripts do harness, `scripts/test/harness-base.test.sh`, "a base vem de um arquivo só, que o frentes.sh e o verify.sh carregam".

## LUI-192-CA2

**Marca:** teste de unidade

**Cenário:** Dado duas frentes que mudam, cada uma do seu jeito, o `schema.prisma`, um arquivo de uma pasta de migração e o snapshot da OpenAPI, quando se roda o `listar`, então o conflito na pasta de migração (`migracoes`) e o do snapshot (`gerado`) aparecem no grupo "ponto de convergência (regra mecânica)", e o do `schema.prisma` aparece em "pede atenção", com o tipo `manual`, e fora do grupo mecânico. O mesmo vale para o `.env.example`.

**Teste previsto:** testes dos scripts do harness, `scripts/test/frentes.test.sh`, "o conflito no schema e no arquivo de variáveis pede atenção, com o tipo manual, e o da pasta de migração e o do snapshot seguem mecânicos".

## LUI-192-CA3

**Marca:** documento

**Cenário:** Dado o diff do PR, quando se lê `scripts/pontos-de-convergencia.txt` e a skill `/sincronizar`, então o schema do Prisma e o arquivo de exemplo de variáveis têm o tipo `manual`, a pasta de migrações segue `migracoes` e o módulo raiz da API segue `registros`; a skill descreve a regra do tipo `manual` (junção à mão, que conta como mexer em lógica) e a do `registros` (um item por linha, só para lista cuja ordem não importa), sem que o arquivo de classificação repita a regra.
