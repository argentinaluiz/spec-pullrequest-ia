# Aceite do LUI-195

Ticket de harness, sem mudança de comportamento: a verificação completa, os hooks dela e os testes de cada peça mudam de lugar para a skill do projeto `/verificar`, e quem chama passa a chamar pelo caminho novo. O CA1 e o CA2 são provados pelas suítes em shell de hoje, que mudam de pasta junto com o que testam e passam a chamar os scripts pelos caminhos novos, com a tag `@LUI-195-CA<n>` no nome de casos que dizem o que mudou (o mapa de testes só nasce no LUI-196, e até lá a tag é a ligação). O CA3 é um teste de integração da própria skill. O CA4 é lido nos dois workflows do GitHub, e o CA5, no `AGENTS.md`.

Decisões que os cenários supõem: o comando da verificação passa a ser `.claude/skills/verificar/scripts/verify.sh`, sem um atalho no lugar antigo (o ticket diz que o script vai inteiro); os testes que ficam em `scripts/test/` são os das peças que ainda não têm dono novo (o conferidor do aceite, o congelamento, a visão do contrato, o ambiente por slot, as frentes e a página do plano), e eles carregam o auxiliar `sh-helpers.sh` do lugar novo, porque um arquivo do projeto pode carregar o de uma skill do projeto; o que muda de lugar não muda de texto, a não ser pelo caminho.

## LUI-195-CA1

**Marca:** teste de unidade

**Cenário:** Dado o `settings.json` do projeto, quando se lê o comando de cada hook que é da verificação (o de fim de turno, o de arquivos tocados e o de antes do push), então cada um aponta para um arquivo que existe e é executável na pasta `hooks/` da skill `/verificar`, e nenhum deles continua na pasta `.claude/hooks/`. Dado o hook de antes do push chamado pelo comando do `settings.json`, quando recebe o destravar, o `full` de um subagente, o `CI=` na frente do comando e o `git push` sem a aprovação, então nega os quatro como antes; o de arquivos tocados anota a edição da sessão; e o de fim de turno bloqueia pelo erro do arquivo da sessão e só avisa pelo de outra sessão, como antes.

**Teste previsto:** testes dos hooks da skill `verificar`, `hooks/test/settings-hooks.test.sh`, "os hooks do settings.json são os da skill verificar e mantêm o comportamento"; e as suítes `push-verify.test.sh`, `stop-verify.test.sh` e `record-touched.test.sh`, que mudam para `hooks/test/` e chamam o hook pelo caminho novo.

## LUI-195-CA2

**Marca:** teste de unidade

**Cenário:** Dado o script de verificação no lugar novo, quando o modo completo reprova pela terceira vez seguida nos mesmos passos, então ele trava e diz como destravar com o comando de caminho novo; o `unlock` tira a trava; o semáforo faz o segundo `full` esperar o primeiro e mostra o dono; e o `prepush` aprova só o conteúdo que o modo completo aprovou e recusa o commit sem aprovação, como antes.

**Teste previsto:** testes dos scripts da skill `verificar`, `full-lock.test.sh` e `full-semaphore.test.sh`, que mudam para `scripts/test/` da skill, com a tag nos casos da terceira reprovação, da espera do semáforo e da aprovação do push.

## LUI-195-CA3

**Marca:** teste de integração

**Cenário:** Dado o repositório depois da mudança, quando a busca dos testes das skills lista as suítes em shell e se lê o nome dos casos de cada uma, então as suítes que mudaram de lugar continuam achadas, sem lista à mão, e cada critério congelado que elas provavam (LUI-183-CA1 a CA3, LUI-185-CA1 a CA3, LUI-186-CA7 e LUI-194-CA5) tem a tag do ID num caso de uma suíte achada, e o executor transforma o token do nome em tag no relatório, como antes.

**Teste previsto:** testes dos scripts da skill `verificar`, `cobertura-dos-movidos.test.sh`, "os critérios congelados provados pelos testes que mudaram de lugar continuam com o ID na tag".

## LUI-195-CA4

**Marca:** revisão humana

**Cenário:** Dado o diff do PR, quando se lê o workflow `CI` e o workflow `Guarda do harness`, então o passo `Verificar` chama o `full` pelo caminho novo da skill `/verificar`, e a Guarda do harness continua chamando o script de `/proteger-harness` com a lista de arquivos protegidos de `/verificar`, as duas da `main`. O check `Veredito` verde no PR (que roda o `full` pelo caminho novo) e a Guarda reprovando só os arquivos protegidos que o PR muda (por ser um PR de harness) confirmam que os dois rodam.

## LUI-195-CA5

**Marca:** documento

**Cenário:** Dado o `AGENTS.md` da raiz, quando se lê a seção "Definição de pronto", então ela traz o comando da verificação completa, o do modo rápido e o de destravar com o caminho novo da skill `/verificar`, e nenhum comando do `AGENTS.md` (nem o dos valores da skill de plano) chama mais o `scripts/verify.sh`. A seção que fala do cabeçalho do auxiliar dos testes em shell aponta para o lugar novo.
