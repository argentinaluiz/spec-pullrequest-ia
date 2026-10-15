# Aceite do LUI-176

Ticket de harness, sem critério de teste: os de revisão humana são provados por demonstração no PR, como nos LUI-172 a LUI-175, e o de documento, pela leitura do diff. O desenho está no `docs/harness.md`, na linha do comando do Node e na seção da verificação.

**O desenho.** O serviço `api` do `compose.dev.yaml` ganha a montagem do repositório inteiro em `/repo`, só leitura, ao lado da `./apps/api:/app`, que continua com escrita. O comando do Node do projeto (`scripts/node-in-api.sh`), que o `node_in_api` do `scripts/verify.sh` também usa, passa a ser uma execução direta: `exec -T -w /repo api node <argumentos>`. Saem o `tar`, a pasta recriada a cada execução em `reports/` e a regra de quais argumentos levar.

**Como os dados chegam sem pasta de fontes.** O que mora no repositório (os scripts, os arquivos de aceite, os relatórios da web em `apps/web/reports`) o Node lê direto de `/repo`. O que nasce na máquina e não está no repositório (o corpo do PR, as fontes que o script da página junta pelo `git`, as que a visão do contrato junta) chega pela entrada padrão, como um só JSON: o construtor da página e a visão do contrato passam a ler as fontes assim, com `-` no lugar da pasta. O que o Node grava (o relatório dos testes do harness) vai para `/app/reports`, a pasta com escrita da API, com caminho absoluto.

**O limite que fica.** O comando do Node deste projeto só enxerga o que está dentro do repositório. Uma skill instalada fora dele precisa de outro comando do Node, como `node` na máquina; a skill continua portável, porque o comando é do projeto.

## LUI-176-CA1

**Marca:** revisão humana

**Cenário:** Dado o repositório com esta mudança e o ambiente subido de novo (`up -d --wait`), quando se roda `ACCEPTANCE_BODY_FILE=<corpo> scripts/verify.sh full`, então o veredito é `APROVADO (full).`, e no log os passos "Testes do harness", "Aceite" e "Contrato e schema contra o commit de plano" rodam; e `grep -n 'tar ' scripts/node-in-api.sh scripts/verify.sh scripts/verify/api.sh` não acha nenhum empacotamento para o contêiner `api`. E `scripts/verify.sh contract HEAD` e `scripts/verify.sh plan <ticket>` funcionam pelo mesmo comando.

## LUI-176-CA2

**Marca:** revisão humana

**Cenário:** Dado o plano de exemplo `LUI-900` numa branch descartável, montado antes da mudança pelo atalho `scripts/verify.sh plan LUI-900`, quando o mesmo plano é montado depois da mudança, então as duas páginas são iguais, salvo a linha de origem; e, durante e depois da montagem, `docs/tickets/LUI-900/` tem só o `plano.html` e o `plano.msg`, e a lista de `git status --short --ignored` depois da montagem é igual à de antes dela, salvo a página: nenhuma pasta de fontes aparece no repositório.

## LUI-176-CA3

**Marca:** revisão humana

**Cenário:** Dado o ambiente no ar, quando se roda `docker compose -f compose.dev.yaml exec -T api sh -c 'touch /repo/teste-de-escrita'`, então o comando falha com "Read-only file system" e o arquivo não aparece na raiz do repositório. E `docker compose -f compose.dev.yaml exec -T api sh -c 'touch /app/reports/teste && rm /app/reports/teste'` funciona, porque as escritas continuam em `/app`.

## LUI-176-CA4

**Marca:** documento

**Cenário:** Dado o `docs/harness.md`, o `AGENTS.md` da raiz e o `compose.dev.yaml` deste PR, quando são lidos, então o harness descreve a montagem só leitura em `/repo`, o comando do Node como execução direta, como os dados que não estão no repositório chegam pela entrada padrão e por que o empacotamento saiu; o `AGENTS.md` traz o valor novo do comando do Node na lista da skill de plano e, na tabela de serviços ou nas notas dela, a montagem; e o `compose.dev.yaml` traz um comentário na montagem dizendo para que ela serve.
