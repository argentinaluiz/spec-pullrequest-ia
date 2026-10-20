# Aceite do LUI-199

Ticket de harness, sem mudança de comportamento neste projeto: o script de frentes se divide em um núcleo genérico, que vai para a skill nova `/worktree`, e o ambiente por slot, que fica no `/ambiente` como extensão. O núcleo funciona num repositório só com o Git; o que é do Docker (o `.env` com as portas, a conferência das portas livres, subir e derrubar o Compose) vira um comando de ambiente da frente, que o núcleo chama. A base, a negação do abandono e das variáveis do modo de teste (hoje no hook de antes do push) e os testes vão para o `/worktree`; o atalho do `/ambiente` chama o núcleo com os valores deste projeto.

Os testes do núcleo, da base e do hook moram numa skill de uso geral e por isso se ligam aos critérios pelo mapa de testes do ticket (`mapa-de-testes.txt`), e os critérios congelados que eles já provavam (LUI-182 e filhos) passam a ser ligados pelos mapas desses tickets, gerados das tags de hoje; o ambiente da frente e o atalho moram numa skill do projeto e levam o ID na tag.

Decisões que os cenários supõem: o núcleo é `scripts/frentes.sh` da skill `/worktree` e recebe os valores por opção, antes do subcomando: `--limite` (padrão 3), `--ambiente` (o comando de ambiente da frente; padrão nenhum) e `--pontos` (o arquivo dos pontos de convergência; padrão nenhum, e todo arquivo é código). O número da frente (o slot) fica no diretório privado do Git do worktree dela, e não numa pasta do projeto: apagar a pasta o libera, e não há registro central. O comando de ambiente da frente é chamado como `<comando> verificar <slot>` (recusa o slot que não está livre, antes de criar qualquer coisa), `<comando> criar <pasta> <slot>` (grava o `.env`, sobe o ambiente), `<comando> derrubar <pasta>` (derruba o ambiente com os volumes) e `<comando> portas <slot>` (imprime as portas do slot, para o `listar`). A base (`harness-base.sh`) passa a ser da `/worktree`, e a verificação a carrega de lá. O atalho do `/ambiente` é `frentes.sh`, que chama o núcleo com os valores deste projeto. O texto do `SKILL.md` da `/worktree` e a saída da `/abrir-frentes` e da `/sincronizar` são do LUI-200.

## LUI-199-CA1

**Marca:** teste de unidade

**Cenário:** Dado um repositório de fora, só com o Git, sem Docker e sem comando de ambiente, quando se roda o núcleo, então o `novo` cria o worktree e a branch a partir da base e imprime o comando para abrir a sessão; o `listar` mostra as frentes com o slot, a branch, o PR e os conflitos; o `novo` recusa a frente além do limite (que a opção `--limite` ajusta) e o ticket que já tem frente; e o `remover` desmonta a frente de um PR mergeado com a pasta limpa, e recusa o PR que não está mergeado, a pasta suja, o checkout principal e um Git abaixo da versão mínima.

**Teste previsto:** testes dos scripts da skill `worktree`, `frentes.test.sh`, "o núcleo cria, lista e remove frentes num repositório só com o Git, com o limite e as recusas".

## LUI-199-CA2

**Marca:** teste de unidade

**Cenário:** Dado o núcleo com um comando de ambiente da frente, quando ele cria uma frente, então chama `verificar` com o slot antes de criar a pasta (e não cria nada se ele recusa) e `criar` com a pasta e o slot depois; quando remove, chama `derrubar` com a pasta; e o `listar` mostra as portas que o `portas` informa para o slot de cada frente. Dado o comando de ambiente deste projeto, quando se chama `criar`, então ele grava o `.env` do slot com as portas e a máscara do `.git` e sobe o Compose na pasta; `verificar` recusa o slot com uma porta ocupada dizendo a porta e o processo; `derrubar` derruba o Compose com os volumes; e `portas` imprime as quatro portas do slot.

**Teste previsto:** testes dos scripts da skill `worktree`, `frentes.test.sh`, "o núcleo chama o comando de ambiente da frente para verificar, criar e derrubar, e lista as portas que ele informa"; e testes dos scripts da skill `ambiente`, `frente-ambiente.test.sh`, "o ambiente da frente grava o .env do slot, confere as portas, sobe e derruba o Compose".

## LUI-199-CA3

**Marca:** teste de unidade

**Cenário:** Dado um repositório com duas frentes, quando o núcleo numera a seguinte, então ela recebe o menor número livre de 1 a 3 e o guarda no diretório privado do Git do worktree dela; apagar a pasta de uma frente (sem o `remover`) libera o número dela para a próxima, e duas criações ao mesmo tempo nunca recebem o mesmo número; nenhum arquivo de registro central é criado e nenhum arquivo aparece na pasta da frente.

**Teste previsto:** testes dos scripts da skill `worktree`, `frentes.test.sh`, "o número da frente fica nela, apagar a pasta o libera e duas criações ao mesmo tempo nunca pegam o mesmo".

## LUI-199-CA4

**Marca:** teste de unidade

**Cenário:** Dado a definição da base na skill `/worktree`, quando o núcleo e a verificação do projeto a carregam, então os dois leem a mesma referência (`origin/main` por padrão), o remoto é o que vem antes da primeira barra, o ramo é o que vem depois, e a variável `HARNESS_BASE_REF` ajusta a base nos dois; e nenhum dos dois lê a variável em outro lugar.

**Teste previsto:** testes dos scripts da skill `worktree`, `harness-base.test.sh`, "a base tem uma definição só, carregada pelo núcleo e pela verificação, e a variável a ajusta nos dois".

## LUI-199-CA5

**Marca:** teste de unidade

**Cenário:** Dado o hook do `/worktree`, quando recebe o comando de um agente, então nega o `frentes.sh` com o `--forcar` (em qualquer posição, embrulhado ou entre aspas) e o `frentes.sh` com as variáveis do modo de teste (`HARNESS_TEST` e as `FRENTES_*`), dizendo que o abandono é só do usuário; e libera o `remover` sem a opção, o `novo`, o `listar` e um comando que só cita o `--forcar` ou a variável. O hook de antes do push não nega mais nenhum dos dois.

**Teste previsto:** testes do hook da skill `worktree`, `frentes-guard.test.sh`, "o hook nega ao agente o abandono e as variáveis do modo de teste, e libera o remover sem elas".

## LUI-199-CA6

**Marca:** teste de unidade

**Cenário:** Dado o atalho `frentes.sh` do `/ambiente`, quando se chama `novo`, `listar` ou `remover`, então ele chama o núcleo com os valores deste projeto (o limite 3, o comando de ambiente da frente do `/ambiente` e o arquivo dos pontos de convergência) e repassa o subcomando e os argumentos, sem a pessoa digitar nenhuma opção.

**Teste previsto:** testes dos scripts da skill `ambiente`, `frentes-atalho.test.sh`, "o atalho chama o núcleo com os valores deste projeto e repassa o subcomando".

## LUI-199-CA7

**Marca:** teste de integração

**Cenário:** Dado os mapas gravados nos tickets que os testes das frentes, da base e do hook provavam (LUI-186, LUI-187 e LUI-192), quando o conferidor lê os mapas e os relatórios das suítes, então cada critério ligado sai coberto pelo mapa, sem nenhuma tag deste projeto nos testes da skill `/worktree`.

**Teste previsto:** testes dos scripts da skill `verificar`, `mapas-de-testes.test.sh`, "os critérios provados pelos testes do conferidor continuam cobertos pelo mapa, sem ID deste projeto nos testes da skill @LUI-199-CA7" (o mesmo teste dos mapas, que passa a olhar também os testes da `/worktree`).
