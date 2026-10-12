# LUI-142 · Funcionalidade 02: upload e download de arquivos

> Cópia para conferência, tirada do Linear em 12/10/2026. A fonte é a issue [LUI-142](https://linear.app/argentinaluiz/issue/LUI-142/funcionalidade-02-upload-e-download-de-arquivos) no Linear; esta cópia não é atualizada quando a issue muda.

| | |
| --- | --- |
| **Tipo** | Spec |
| **Situação** | Backlog |
| **Labels** | `ready-for-agent`, `Feature` |
| **Tickets** | [LUI-143](./LUI-143-validacao-do-storage-local.md) Validação do storage local<br>[LUI-144](./LUI-144-telas-de-arquivos-no-figma.md) Telas de arquivos no Figma<br>[LUI-145](./LUI-145-listagem-da-pasta-raiz.md) Listagem da pasta raiz<br>[LUI-146](./LUI-146-enviar-um-arquivo.md) Enviar um arquivo<br>[LUI-147](./LUI-147-arrastar-varios-arquivos-e-cancelar.md) Arrastar, vários arquivos e cancelar<br>[LUI-148](./LUI-148-baixar-um-arquivo.md) Baixar um arquivo<br>[LUI-149](./LUI-149-limpeza-de-uploads-pendentes.md) Limpeza de uploads pendentes<br>[LUI-150](./LUI-150-retomada-de-envios.md) Retomada de envios |

---

## 1. Executive Summary

### Problem Statement

O Usuário já consegue entrar, mas cai numa página provisória e não tem como guardar nem recuperar um único arquivo. Sem upload e download o produto não entrega a promessa central, e a métrica de ativação do brief (primeiro upload em até 24 horas) não pode nem ser medida.

### Proposed Solution

O Usuário envia arquivos de até 5 GB arrastando-os para a tela ou escolhendo-os pelo botão "Enviar", vários de uma vez, e acompanha o progresso num painel. O envio vai direto do navegador para o storage, em partes, retoma sozinho depois de uma queda de rede e pode ser retomado depois de fechar a aba. Os arquivos aparecem numa listagem da pasta raiz, de onde o Usuário os baixa. O servidor reserva o espaço antes de cada envio, de modo que ninguém passa dos 15 GB do plano gratuito.

### Success Criteria

| Indicador | Meta | Como é conferido |
| -- | -- | -- |
| Ativação | 60% dos Usuários fazem o primeiro upload em até 24 horas após o cadastro (meta do brief) | Medição em produção, 6 meses após o lançamento |
| Retomada sem reenvio | Depois de uma queda de rede, o envio continua do byte que o storage informa ter recebido. Nenhum byte já recebido é reenviado, em arquivos de 1 byte a 5 GB | Teste no navegador com a rede cortada no meio do envio, e teste no staging com o storage real |
| Cota inviolável | Em 100% dos casos, uploads iniciados ao mesmo tempo nunca levam os bytes usados acima do limite do plano | Teste HTTP da API com pedidos concorrentes |
| Espaço devolvido | Todo upload abandonado devolve o espaço reservado em até 25 horas (24 horas de prazo mais uma execução horária da limpeza) | Teste HTTP da API com o prazo reduzido |
| Latência | Iniciar upload, concluir upload e pedir a URL de download respondem em menos de 300 ms no percentil 95 (valor do HLD) | Medição no staging |

## 2. User Experience & Functionality

### User Personas

* **Usuário pessoa física:** estourou os 15 GB gratuitos de outro serviço. Envia fotos, vídeos e documentos pessoais, muitas vezes pelo celular e com rede instável.
* **Usuário freelancer:** envia arquivos de trabalho grandes (vídeo, projetos, PDFs pesados) pelo computador e não pode perder um envio de horas por causa de uma queda de rede.
* **Operador:** responde pelo custo do armazenamento. Precisa que a cota valha no servidor e que uploads abandonados não prendam espaço.
* **Desenvolvedor:** precisa do storage e do worker funcionando no ambiente local, sem conta no Google Cloud.

### User Stories e Acceptance Criteria

Cada critério diz por onde é conferido: **\[API\]** é teste HTTP da API e **\[Navegador\]** é teste no navegador.

**Listagem da raiz**

1. Como Usuário, quero ver meus arquivos assim que entro, para saber o que já guardei.
   * A página provisória pós-login dá lugar à listagem da pasta raiz, que continua mostrando o e-mail do Usuário e o botão "Sair". **\[Navegador\]**
   * A pasta raiz é criada sob demanda, uma por Usuário, na primeira vez que é necessária. Pedidos simultâneos não criam duas. **\[API\]**
   * A listagem mostra só arquivos ativos, ordenados por nome, com nome, tipo, tamanho e data de modificação. Uploads pendentes não aparecem. **\[API\]**
   * A listagem é paginada por cursor, com 50 itens por padrão e no máximo 200. **\[API\]**
   * Sem arquivos, a tela mostra o estado vazio "Arraste arquivos para cá ou clique em Enviar". **\[Navegador\]**
   * Um Usuário nunca vê, pela listagem ou pelo id, um item de outro Usuário: a resposta é `not_found`. **\[API\]**
2. Como Usuário, quero usar a listagem pelo celular, para enviar e baixar de onde estiver.
   * Abaixo de 640px, a lista mostra o nome e, numa segunda linha, tamanho e data, como define o design system. **\[Navegador\]**

**Envio**

3. Como Usuário, quero arrastar arquivos para a tela, para enviá-los sem procurar um botão.
   * Enquanto arrasto arquivos sobre a janela, a zona de soltar cobre a área de conteúdo. Ao soltar, os envios começam. **\[Navegador\]**
4. Como Usuário, quero escolher arquivos pelo botão "Enviar", para enviar pelo celular ou sem arrastar.
   * O botão abre o seletor do sistema, que aceita vários arquivos. **\[Navegador\]**
5. Como Usuário, quero enviar vários arquivos de uma vez, para não repetir a ação.
   * Até 3 arquivos são enviados ao mesmo tempo, e os demais esperam na fila. **\[Navegador\]**
   * O cabeçalho do painel de uploads resume o andamento ("Enviando 3 de 5"). **\[Navegador\]**
6. Como Usuário, quero ver o progresso de cada arquivo, para saber quanto falta.
   * Cada arquivo tem uma linha no painel, com percentual e barra, nos estados enviando, retomando, concluído e falhou. **\[Navegador\]**
   * Ao concluir, o arquivo aparece na listagem sem recarregar a página. **\[Navegador\]**
7. Como Usuário, quero enviar arquivos de até 5 GB, para guardar vídeos e projetos grandes.
   * Iniciar um upload acima de 5 GB responde `file_too_large`, e nada é reservado. **\[API\]**
   * A web recusa o arquivo antes de chamar a API e mostra "O arquivo passa do limite de 5 GB". **\[Navegador\]**
   * Arquivos menores que 8 MiB vão num único envio. Os demais vão em partes de 8 MiB, uma por vez. **\[Navegador\]**
8. Como Usuário, quero enviar arquivos com o mesmo nome de outros, para não ter de renomear antes.
   * Nomes duplicados na mesma pasta são aceitos e viram itens distintos. **\[API\]**
   * Nome vazio, com mais de 255 caracteres, com `/` ou com caracteres de controle responde `validation_error`. **\[API\]**
9. Como Usuário, quero cancelar um envio, para desistir de um arquivo errado.
   * Cancelar remove o upload pendente, apaga o que já chegou ao storage e devolve o espaço reservado. **\[API\]**
   * A linha do painel tem um botão de cancelar enquanto o arquivo está enviando. **\[Navegador\]**

**Retomada**

10. Como Usuário, quero que o envio continue sozinho depois de uma queda de rede, para não recomeçar um arquivo grande.
    * Depois de uma falha, o navegador pergunta ao storage quanto ele recebeu e continua do byte seguinte. **\[Navegador\]**
    * Cada parte é tentada até 5 vezes, com espera crescente de 1 a 30 segundos. Esgotadas as tentativas, a linha fica em "falhou" com o botão "Tentar de novo", que retoma do ponto em que parou. **\[Navegador\]**
11. Como Usuário, quero retomar um envio depois de fechar a aba, para não perder o que já subiu.
    * Ao voltar, a tela lista os envios incompletos e pede que eu selecione o arquivo de novo. **\[Navegador\]**
    * Se nome, tamanho e data de modificação baterem com o que foi guardado, o envio retoma do ponto em que parou. Se não baterem, a tela avisa e não envia. **\[Navegador\]**
    * O navegador guarda só o id do item e a impressão do arquivo. A URL da sessão de upload nunca é guardada. **\[Navegador\]**
    * Pedir de novo a sessão de um upload pendente devolve a mesma sessão. Para um item que não está pendente ou é de outro Usuário, a resposta é `not_found`. **\[API\]**
12. Como Usuário, quero que um envio com a sessão expirada recomece do zero sem eu perceber o motivo técnico, para não ficar travado.
    * Quando o storage informa que a sessão não existe mais, o navegador cancela o upload e inicia outro para o mesmo arquivo. **\[Navegador\]**

**Cota**

13. Como Usuário gratuito, quero ser avisado antes de enviar quando o arquivo não cabe nos meus 15 GB, para não esperar um envio que vai falhar.
    * Iniciar um upload cujo tamanho, somado aos bytes usados, passa do limite do plano responde `quota_exceeded`, e nada é criado. **\[API\]**
    * A linha do painel mostra "Sem espaço no seu plano" e os outros arquivos da fila seguem. **\[Navegador\]**
14. Como operador, quero que a cota valha no servidor, para o custo dos Usuários gratuitos ter teto.
    * Todo Usuário, novo ou já existente, está no plano gratuito de 15 GB. **\[API\]**
    * Com pedidos simultâneos, a soma dos tamanhos reservados nunca passa do limite. **\[API\]**
    * Concluir um upload cujo tamanho real difere do declarado responde `upload_size_mismatch`, apaga o objeto e devolve o espaço. **\[API\]**
    * Concluir um upload cujo objeto não existe no storage não o torna ativo. **\[API\]**
15. Como operador, quero que uploads abandonados devolvam o espaço, para a cota não ficar presa.
    * A limpeza remove uploads pendentes há mais de 24 horas, apaga o que chegou ao storage e devolve o espaço. Rodar a limpeza duas vezes dá o mesmo resultado. **\[API\]**
    * Uploads pendentes dentro do prazo não são tocados. **\[API\]**

**Download**

16. Como Usuário, quero baixar um arquivo meu, para usá-lo fora do produto.
    * A ação "Baixar" da linha inicia o download com o nome original do arquivo. **\[Navegador\]**
    * A API devolve uma URL assinada de leitura, válida por 5 minutos. **\[API\]**
    * Pedir a URL de um item pendente, de uma pasta, de um item inexistente ou de outro Usuário responde `not_found`. **\[API\]**
    * Uma conta acima da cota continua baixando. **\[API\]**

**Operação e desenvolvimento**

17. Como desenvolvedor, quero o storage e o worker no Docker Compose, para desenvolver e testar sem conta no Google Cloud.
    * O ambiente sobe com o emulador de storage, o bucket criado e o CORS configurado, sem passo manual. **\[API\]**
    * A limpeza de pendentes é disparada por um comando, no ambiente local. **\[API\]**
18. Como operador, quero trocar o storage sem alterar as regras de negócio, para não ficar preso a um fornecedor.
    * As regras só conhecem uma interface de storage, e o Cloud Storage é um driver dela. **\[API\]**

### Non-Goals

* Criar, renomear, mover e excluir pastas, navegar entre pastas e a trilha de pastas (funcionalidade 03). Todo upload desta spec vai para a raiz.
* Excluir arquivos, lixeira e restauração (funcionalidades 03 e 04). Nesta entrega, um arquivo enviado só sai pelo cancelamento do upload.
* Pré-visualização e miniaturas (funcionalidade 05). A listagem mostra o ícone do tipo.
* Busca (06), compartilhamento por link (07), indicador de uso da cota (08) e planos pagos (09). A tabela de planos nasce só com o plano gratuito.
* Enviar uma pasta inteira arrastando-a. Só arquivos são aceitos.
* Download de vários arquivos de uma vez ou de uma pasta em ZIP.
* Seleção múltipla, ações em lote, alternância entre lista e grade e ordenação pelo cabeçalho da lista.
* Fila de tarefas, novas tentativas de tarefa e a rotina de reconciliação dos bytes usados.
* Limite geral de requisições por Usuário.
* Dados de exemplo (seed).
* Staging e produção: o bucket real e a autenticação das chamadas ao worker entram com a infraestrutura.

## 3. AI System Requirements

Não se aplica. A funcionalidade não usa IA, e o brief exclui a análise do conteúdo dos arquivos.

## 4. Technical Specifications

### Architecture Overview

O fluxo é o "Upload com reserva de cota" do HLD, e os parâmetros são os da seção "Upload em chunks" do LLD.

1. A web pede à API o início do upload, com nome, tamanho, tipo e pasta de destino.
2. A API reserva o espaço e cria o item pendente na mesma transação, abre uma sessão de upload retomável no storage e devolve a URL da sessão.
3. O navegador envia o arquivo em partes, direto para o storage. A API não recebe o conteúdo.
4. A web pede a conclusão. A API confere no storage a existência e o tamanho real e torna o item ativo.
5. No download, a API confere o dono e devolve uma URL assinada curta. O navegador baixa direto do storage.
6. A cada hora, o worker remove os uploads pendentes vencidos.

**Módulos**

* **Módulo de itens (novo):** dono da tabela de itens. Cria a pasta raiz sob demanda, lista os filhos de uma pasta e devolve um item. Expõe um service público para os outros módulos.
* **Módulo de uploads (novo):** inicia, retoma, conclui e cancela uploads, devolve a URL de download e contém a limpeza de pendentes. Acessa itens e cota só pelos services públicos dos módulos donos.
* **Cota:** a reserva e a devolução de espaço são operações do módulo de usuários, dono dos bytes usados e do plano. A tabela de planos nasce aqui, com o plano gratuito.
* **Storage (novo, infraestrutura):** interface com as operações de criar sessão retomável, consultar um objeto, apagar um objeto e assinar uma URL de leitura. O driver é o do Cloud Storage, que no ambiente local aponta para o emulador.
* **Worker (novo):** a mesma imagem da API, num serviço próprio, com um endpoint interno para a limpeza de pendentes.
* **Web:** a listagem da raiz, a zona de soltar, o painel de uploads e o cliente de upload em partes, que roda no navegador. Iniciar, concluir, cancelar e pedir a URL de download passam pelo servidor da web, como as demais chamadas à API.

**Esquema**

* **Itens:** como na seção "Esquema do banco" do LLD, com os índices de listagem de pasta, de limpeza de pendentes e de raiz única por Usuário. Os índices de lixeira e de busca ficam para as funcionalidades que os usam.
* **Planos:** código, limite em bytes, preços e disponibilidade. Só o plano gratuito é criado, com 15 GB.
* **Usuários:** ganham o plano e os bytes usados. A migração põe os Usuários existentes no plano gratuito, com zero bytes usados.

### Integration Points

**Contrato da API**, sob `/v1`, com autenticação pelo token de acesso em todas as rotas:

| Rota | Entrada | Saída |
| -- | -- | -- |
| `GET /items/{id}` |  | O item. `root` é atalho para a pasta raiz. |
| `GET /items/{id}/children` | `limit`, `cursor` | Itens ativos da pasta e `nextCursor` |
| `POST /uploads` | `name`, `sizeBytes`, `mimeType`, `parentId`, e o cabeçalho `Idempotency-Key` | 201: `itemId`, `uploadUrl`, `expiresAt` |
| `GET /uploads/{itemId}` |  | `itemId`, `uploadUrl`, `expiresAt` |
| `POST /uploads/{itemId}/complete` |  | O item, já ativo |
| `DELETE /uploads/{itemId}` |  | 204 |
| `GET /items/{id}/download-url` | `disposition` (`attachment` ou `inline`) | `url`, `expiresAt` |

Códigos de erro usados: `validation_error`, `unauthenticated`, `not_found`, `upload_size_mismatch`, `file_too_large` e `quota_exceeded`.

* **Idempotência:** repetir o início de um upload com a mesma chave devolve o mesmo item, sem reservar espaço duas vezes.
* **Destino:** `parentId` aceita `root` ou o id de uma pasta ativa do Usuário. Nesta entrega só a raiz existe.
* **Disposição:** a API aceita os dois valores do contrato. A web usa só `attachment`; `inline` fica para a pré-visualização.

**Storage**

* O navegador fala com o storage por um endereço diferente do que a API usa entre contêineres. A URL da sessão e a URL assinada devolvidas ao navegador usam o endereço público, que é uma configuração nova.
* O bucket é privado. O CORS aceita só a origem da web, para os métodos de upload e download, e expõe o cabeçalho que informa os bytes recebidos.
* A sessão retomável é criada com a origem da web.

**Ambiente local**

* O Compose ganha os serviços de storage (emulador) e de worker.
* As variáveis do bucket, do endereço do emulador, do endereço público do storage, do endereço do worker e do prazo de upload pendente entram no arquivo de exemplo, com valores que funcionam localmente, e na validação da subida.

**Autenticação:** a Sessão da funcionalidade 01, sem mudança.

### Security & Privacy

* **Dono:** toda consulta filtra pelo dono. Item inexistente e item de outro Usuário respondem igual, com `not_found`.
* **Chave do objeto:** um identificador aleatório, sem relação com o nome, a pasta ou o Usuário.
* **URL da sessão de upload:** quem a tem consegue gravar na sessão. Ela só vai ao navegador do dono, não é guardada no `localStorage` e não aparece em log.
* **URL de download:** assinada, válida por 5 minutos, com a disposição e o nome do arquivo fixados pela API.
* **Tipo do arquivo:** é o declarado pelo navegador. O servidor não abre nem analisa o conteúdo, como promete o brief.
* **Tamanho:** o declarado vale para a reserva, e o real é conferido na conclusão. Divergência apaga o objeto.
* **Endpoint do worker:** não é publicado na máquina no ambiente local. A autenticação por OIDC entra com o staging.
* **Localização:** os dados ficam na região de São Paulo, em staging e produção.

### Testing

* **HTTP da API:** os testes sobem a aplicação inteira, com o PostgreSQL e o emulador de storage reais do Compose, e fazem o papel do navegador ao enviar bytes para a sessão. Cobrem o contrato inteiro, a concorrência da reserva, a idempotência, a conferência do tamanho, o cancelamento, a limpeza com o prazo reduzido por variável de ambiente e o isolamento entre Usuários.
* **Navegador:** o Playwright cobre arrastar e escolher arquivos, a fila de 3 simultâneos, o progresso, o cancelamento, a retomada com a rede cortada, a retomada depois de fechar a aba, os erros de cota e de tamanho e o download.
* **Integração da infraestrutura:** a interface de storage é testada contra o emulador.
* **Unitários:** só funções puras, como o cálculo da próxima parte a partir do que o storage recebeu e a impressão do arquivo.
* **Telas:** passam pela validação visual do design system.

## 5. Risks & Roadmap

### Phased Rollout

**MVP (esta spec)**, na ordem dos tickets:

1. **Validação do storage local:** sobe o emulador no Compose e prova a sessão retomável, o CORS com o cabeçalho de bytes recebidos e a URL assinada. Se algum dos três falhar, a decisão volta ao responsável pelo produto antes de os outros tickets começarem.
2. **Telas no Figma:** listagem da raiz, estado vazio, zona de soltar e painel de uploads com os estados de cada linha, em paralelo com o passo 1.
3. **Raiz, listagem e cota:** planos, bytes usados, pasta raiz e a listagem no lugar da página provisória.
4. **Upload de um arquivo:** iniciar, enviar em partes, concluir e cancelar, com reserva de cota e painel de uploads.
5. **Vários arquivos e retomada:** fila de 3 simultâneos, novas tentativas, retomada após queda de rede e após fechar a aba.
6. **Download.**
7. **Limpeza de pendentes:** worker e comando de disparo.

**v1.1:** pastas (03), lixeira (04) e pré-visualização com miniaturas (05), que acrescentam o destino do upload, a exclusão e a fila de tarefas.

**v2.0:** indicador de cota (08), planos pagos (09) e, na fase 2 do brief, o backup automático de fotos pelos apps nativos, que reutiliza estas rotas.

### Technical Risks

| Risco | Mitigação |
| -- | -- |
| O emulador não suporta sessão retomável ou URL assinada como o Cloud Storage | Ticket de validação antes de todos os outros, e testes de ponta a ponta no staging, contra o serviço real |
| O staging ainda não existe, então a divergência entre emulador e serviço real só aparece depois | Registrar a pendência e rodar a suíte de upload no staging assim que ele existir, antes do lançamento |
| O navegador não lê o progresso da sessão por causa do CORS do bucket | Conferido no ticket de validação e coberto por teste no navegador |
| Espaço preso por uploads abandonados | Limpeza a cada hora, com prazo de 24 horas |
| Sem exclusão nesta entrega, o Usuário enche a cota e não libera espaço | Aceito até a funcionalidade 03, que vem em seguida. Nenhum lançamento público acontece antes dela. |
| Bytes usados divergem da soma dos itens depois de uma falha no meio de uma operação | Reserva e criação do item na mesma transação. A rotina de reconciliação entra com o worker completo. |
| Custo de tráfego de saída no download | Medir o custo por GB baixado no staging, como já prevê o HLD |
| Envio de 5 GB em rede móvel leva horas e a sessão de 24 horas expira | O navegador recomeça do zero quando a sessão expira. Rever o prazo com dados reais. |

### Pontos a confirmar

* **Arquivo de 0 byte:** o LLD não diz se é aceito. A proposta é aceitar, por ser um arquivo válido para o Usuário.
* **Limite de 5 GB por arquivo:** segue em aberto no HLD e é assumido aqui.
* **Documentos a atualizar no planejamento:** o LLD diz que o plano e os bytes usados chegam com a funcionalidade de cota e que a raiz é criada pela funcionalidade de pastas, e os dois passam a nascer aqui. O endereço público do storage é uma variável nova. O glossário ainda não define "Item", "Arquivo", "Pasta" e "Upload".
