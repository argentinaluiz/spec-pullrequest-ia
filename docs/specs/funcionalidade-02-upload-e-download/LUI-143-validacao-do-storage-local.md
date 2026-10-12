# LUI-143 · Validação do storage local

> Cópia para conferência, tirada do Linear em 12/10/2026. A fonte é a issue [LUI-143](https://linear.app/argentinaluiz/issue/LUI-143/validacao-do-storage-local) no Linear; esta cópia não é atualizada quando a issue muda.

| | |
| --- | --- |
| **Tipo** | Ticket |
| **Situação** | Backlog |
| **Labels** | `ready-for-agent`, `Feature` |
| **Spec** | [LUI-142](./LUI-142-spec.md) Funcionalidade 02: upload e download de arquivos |
| **Bloqueado por** | — |
| **Bloqueia** | [LUI-146](./LUI-146-enviar-um-arquivo.md) Enviar um arquivo |

---

## Parent

[LUI-142](./LUI-142-spec.md)

## What to build

O ambiente local passa a ter um storage que se comporta como o Cloud Storage nos três pontos de que o upload e o download dependem, e a API ganha a interface pela qual as regras de negócio vão falar com ele. Este é um ticket de preparação: não entrega tela nem rota, e prova que o emulador serve antes de os outros tickets começarem.

O desenvolvedor sobe o ambiente e, sem passo manual, o storage está no ar, com o bucket criado e o CORS configurado para a origem da web.

Regras que valem aqui:

* O emulador é o `fake-gcs-server`, como define o HLD. O serviço entra no Compose de desenvolvimento com o nome `storage`.
* A API alcança o storage pelo nome do serviço do Compose. O navegador o alcança por um endereço publicado na máquina. As URLs devolvidas ao navegador (a da sessão de upload e a assinada de leitura) usam o endereço público, que é uma configuração nova.
* O bucket é privado. O CORS aceita só a origem da web, para os métodos de upload e download, e expõe o cabeçalho que informa os bytes já recebidos.
* A interface de storage fica na infraestrutura da API, ao lado da de e-mail, e tem quatro operações: criar uma sessão de upload retomável (com a origem da web), consultar a existência e o tamanho de um objeto, apagar um objeto e assinar uma URL de leitura com validade, disposição e nome de arquivo. As regras de negócio só conhecem a interface; o driver é o do Cloud Storage, que no ambiente local aponta para o emulador.
* As variáveis do bucket, do endereço do emulador e do endereço público do storage entram no arquivo de exemplo, com valores que funcionam localmente, e na validação da subida.
* Os dois "pontos de implementação a validar" da seção "Upload em chunks" do LLD são conferidos na documentação atual do Cloud Storage e resolvidos aqui.
* **Se o emulador falhar em algum dos três pontos** (sessão retomável, leitura dos bytes recebidos pelo navegador, URL assinada), o trabalho para. O resultado é registrado neste ticket, com o que falhou e as alternativas, e a decisão volta ao responsável pelo produto. Os demais tickets não começam.
* Documentos atualizados na mesma tarefa: o LLD (a variável do endereço público, o schema de validação e os pontos validados), o HLD (o Compose passa a ter o `storage`, e a questão em aberto do emulador é fechada) e o guia de agentes da raiz (a tabela de serviços e o que o contêiner prepara na subida).

## Acceptance criteria

- [ ] O ambiente sobe do zero com o serviço de storage pronto, o bucket criado e o CORS configurado, sem passo manual.
- [ ] Criar uma sessão retomável, enviar um objeto em duas ou mais partes e consultar o objeto devolve o tamanho total enviado (teste de integração contra o emulador).
- [ ] Depois de enviar só parte de um objeto, consultar o progresso da sessão informa os bytes já recebidos, e o envio continua do byte seguinte (teste de integração contra o emulador).
- [ ] Uma requisição com a origem da web recebe os cabeçalhos de CORS, e o cabeçalho de bytes recebidos está entre os expostos (teste de integração contra o emulador).
- [ ] A URL assinada de leitura devolve o conteúdo do objeto, com a disposição e o nome de arquivo pedidos (teste de integração contra o emulador).
- [ ] Apagar um objeto faz a consulta seguinte informar que ele não existe, e apagar um objeto inexistente não é erro (teste de integração contra o emulador).
- [ ] As URLs devolvidas pela interface usam o endereço público do storage, e não o nome do serviço do Compose (teste de integração).
- [ ] A API não sobe sem as variáveis novas obrigatórias (teste de integração da validação da subida).
- [ ] O LLD, o HLD e o guia de agentes da raiz refletem o serviço novo, as variáveis novas e os pontos validados.
- [ ] Todas as suítes de teste, a compilação do TypeScript e o lint passam na API, dentro do contêiner.
