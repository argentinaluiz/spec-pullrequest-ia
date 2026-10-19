# Aceite do LUI-185

Ticket de harness: o modo completo ganha um semáforo da máquina e um passo da ordem das migrações. Os CA1 a CA3 são provados por testes de unidade em shell, que rodam na máquina e entram no relatório dos testes em shell com a tag `@LUI-185-CA<n>`. O CA4 é lido no diff.

Os testes do semáforo (CA1 e CA2) usam um repositório temporário com um worktree, e o `.git` comum dele, que os dois checkouts dividem, é onde fica a trava. O "outro checkout" que tem o `full` em andamento é um processo do próprio teste que segura a trava e grava quem é, sem rodar verificação nenhuma. Quem espera é, no CA1, a função do semáforo no segundo checkout e, no CA2, o `scripts/verify.sh full` de verdade, com o estado da trava das reprovações de um repositório temporário (o mesmo padrão do `full-lock.test.sh`): ele só chega ao semáforo depois de achar a base, e o teste o interrompe antes de ele começar a verificar. O teste do passo das migrações (CA3) roda a função do grupo da API num repositório temporário, com a base e a branch como dois commits.

## LUI-185-CA1

**Marca:** teste de unidade

**Cenário:** Dado um repositório com dois checkouts e um `full` em andamento no primeiro, que segura a trava da máquina, quando o segundo pede a vez, então ele não começa, imprime que espera o `full` do primeiro dizendo o checkout e a branch dele, e continua esperando enquanto a trava está presa; quando o primeiro termina e solta a trava, o segundo começa, e passa a ser ele quem consta como o `full` em andamento.

**Teste previsto:** testes dos scripts do harness, `scripts/test/full-semaphore.test.sh`, "o full espera o de outro checkout, diz de qual é, e começa quando ele termina".

## LUI-185-CA2

**Marca:** teste de unidade

**Cenário:** Dado o estado da trava das reprovações com duas reprovações iguais seguidas, a aprovação anterior gravada e um `full` de outro checkout em andamento, quando o `scripts/verify.sh full` espera a vez e é interrompido, então a contagem continua em duas, a aprovação anterior continua gravada e o `verify.sh` não imprime reprovação nenhuma. A espera não é um passo da verificação, e a interrupção não deixa a trava da máquina presa.

**Teste previsto:** testes dos scripts do harness, `scripts/test/full-semaphore.test.sh`, "a espera, mesmo interrompida, não conta como reprovação nem apaga a aprovação".

## LUI-185-CA3

**Marca:** teste de unidade

**Cenário:** Dado uma base com a migração mais recente `20261015122813_a` e uma branch com migrações novas, quando a nova tem um nome anterior ao dela (`20261010000000_b`), então o passo reprova, diz qual migração está fora de ordem e qual é a mais recente da base, e diz como recriá-la com um nome posterior; e quando todas as novas vêm depois (`20261020000000_c`), ou não há nenhuma nova, o passo aprova. Uma nova antes e outra depois reprova só por causa da que está antes.

**Teste previsto:** testes dos scripts do harness, `scripts/test/api-migration-order.test.sh`, "reprova a migração nova anterior à mais recente da base, diz como recriá-la e aprova quando todas vêm depois".

## LUI-185-CA4

**Marca:** documento

**Cenário:** Dado o diff do PR, quando se lê o cabeçalho do `scripts/verify.sh`, então ele descreve o semáforo (um `full` por vez entre os checkouts do repositório, onde fica a trava, o que a espera mostra, que a espera não conta como reprovação e que a CI não o usa) e o passo das migrações; e a "Definição de pronto" do `AGENTS.md` da raiz manda rodar o `full` em segundo plano, sem repetir o conteúdo do cabeçalho.
