# LUI-146 · Enviar um arquivo

> Cópia para conferência, tirada do Linear em 12/10/2026. A fonte é a issue [LUI-146](https://linear.app/argentinaluiz/issue/LUI-146/enviar-um-arquivo) no Linear; esta cópia não é atualizada quando a issue muda.

| | |
| --- | --- |
| **Tipo** | Ticket |
| **Situação** | Backlog |
| **Labels** | `ready-for-agent`, `Feature` |
| **Spec** | [LUI-142](./LUI-142-spec.md) Funcionalidade 02: upload e download de arquivos |
| **Bloqueado por** | [LUI-143](./LUI-143-validacao-do-storage-local.md) Validação do storage local, [LUI-145](./LUI-145-listagem-da-pasta-raiz.md) Listagem da pasta raiz |
| **Bloqueia** | [LUI-147](./LUI-147-arrastar-varios-arquivos-e-cancelar.md) Arrastar, vários arquivos e cancelar, [LUI-148](./LUI-148-baixar-um-arquivo.md) Baixar um arquivo, [LUI-149](./LUI-149-limpeza-de-uploads-pendentes.md) Limpeza de uploads pendentes, [LUI-150](./LUI-150-retomada-de-envios.md) Retomada de envios |

---

## Parent

[LUI-142](./LUI-142-spec.md)

## What to build

O Usuário clica em "Enviar", escolhe um arquivo de até 5 GB e acompanha o progresso no painel de uploads. O arquivo vai direto do navegador para o storage, em partes, e ao terminar aparece na listagem, sem recarregar a página. Se o arquivo não cabe no plano ou passa do limite de tamanho, o Usuário é avisado antes de qualquer byte ser enviado.

Este é o caminho mínimo do upload: um arquivo por vez, pelo botão, sem falha de rede. Arrastar, vários arquivos, cancelamento e retomada são tickets seguintes.

Regras que valem aqui:

* **Cota:** nasce a tabela de planos, só com o plano gratuito de 15 GB, e o Usuário ganha o plano e os bytes usados. A migração põe os Usuários existentes no plano gratuito, com zero bytes usados, e todo Usuário novo nasce nele. A reserva e a devolução de espaço são operações do módulo de usuários, dono desses dados, e seguem a seção "Cota" do LLD: um único comando, sem bloqueio explícito.
* **Módulo de uploads (novo):** inicia e conclui uploads. Acessa itens, cota e storage só pelos services públicos e pela interface de storage.
* **Iniciar:** recebe nome, tamanho, tipo e pasta de destino. Na mesma transação, reserva o tamanho declarado e cria o item pendente. Depois abre a sessão retomável no storage e devolve o id do item, a URL da sessão e a validade. Se a sessão não puder ser aberta, o item não fica e o espaço volta.
* **Destino:** aceita `root` ou o id de uma pasta ativa do Usuário. Qualquer outro id responde `not_found`.
* **Nome:** de 1 a 255 caracteres, sem `/` nem caracteres de controle. Nomes duplicados na mesma pasta são aceitos.
* **Tamanho:** acima de 5 GB responde `file_too_large`. Arquivo de 0 byte é aceito, como propõe a spec nos pontos a confirmar.
* **Tipo:** é o declarado pelo navegador. O servidor não abre o conteúdo.
* **Idempotência:** repetir o início com a mesma chave de idempotência devolve o mesmo item, sem reservar espaço duas vezes.
* **Concluir:** confere no storage a existência e o tamanho real. Se baterem, o item fica ativo. Se o tamanho diferir, responde `upload_size_mismatch`, apaga o objeto, remove o item e devolve o espaço. Se o objeto não existir, o item continua pendente. Concluir um item que não está pendente ou é de outro Usuário responde `not_found`.
* **Chave do objeto:** um identificador aleatório, sem relação com o nome, a pasta ou o Usuário.
* **URL da sessão:** não aparece em log.
* **Navegador:** segue a seção "Upload em chunks" do LLD. Arquivos menores que 8 MiB vão num único envio. Os demais vão em partes de 8 MiB, uma por vez, e a próxima parte é calculada a partir do que o storage informa ter recebido.
* **Web:** iniciar e concluir passam pelo servidor da web, como as demais chamadas à API. Só os bytes do arquivo vão do navegador ao storage. A web recusa um arquivo acima de 5 GB antes de chamar a API.
* **Painel de uploads:** uma linha por arquivo, com percentual e barra, nos estados enviando, concluído e falhou. As mensagens de falha são em português, traduzidas do código do erro: "Sem espaço no seu plano" e "O arquivo passa do limite de 5 GB".
* **Listagem:** passa a mostrar arquivos, com ícone do tipo, nome, tipo, tamanho e data de modificação, e o comportamento responsivo do design system.
* Uma falha de rede no meio do envio deixa a linha em "falhou". Novas tentativas e retomada não fazem parte deste ticket, nem o cancelamento.
* Documentos atualizados na mesma tarefa: o glossário ganha "Upload", e o LLD registra que os planos e os bytes usados nascem com esta funcionalidade e a regra do arquivo de 0 byte.

## Acceptance criteria

- [ ] Iniciar um upload devolve 201 com o id do item, a URL da sessão e a validade, e o item ainda não aparece na listagem (teste HTTP).
- [ ] Enviar os bytes à sessão e concluir devolve o item ativo, que passa a aparecer na listagem com nome, tipo e tamanho (teste HTTP).
- [ ] Um arquivo maior que 8 MiB enviado em partes é concluído com o tamanho total (teste HTTP).
- [ ] Um arquivo de 0 byte é enviado e concluído (teste HTTP).
- [ ] Iniciar acima de 5 GB responde `file_too_large`, e um upload que caberia na cota restante continua sendo aceito depois (teste HTTP).
- [ ] Iniciar um upload que não cabe no espaço restante responde `quota_exceeded` e não cria item (teste HTTP).
- [ ] Um Usuário criado antes desta entrega e um criado depois têm os mesmos 15 GB (teste HTTP).
- [ ] Com pedidos simultâneos cuja soma passa de 15 GB, só são aceitos os que cabem (teste HTTP).
- [ ] Repetir o início com a mesma chave de idempotência devolve o mesmo item e reserva o espaço uma vez só (teste HTTP).
- [ ] Nome vazio, com mais de 255 caracteres, com `/` ou com caractere de controle responde `validation_error` (teste HTTP).
- [ ] Dois uploads com o mesmo nome viram dois itens na listagem (teste HTTP).
- [ ] Destino inexistente ou de outro Usuário responde `not_found` (teste HTTP).
- [ ] Concluir com tamanho real diferente do declarado responde `upload_size_mismatch`, o item some e o espaço volta a aceitar um upload que antes não caberia (teste HTTP).
- [ ] Concluir sem ter enviado o objeto não torna o item ativo (teste HTTP).
- [ ] Concluir um upload de outro Usuário, ou um item já ativo, responde `not_found` (teste HTTP).
- [ ] A listagem devolve os arquivos ordenados por nome e pagina por cursor, sem repetir nem pular itens (teste HTTP).
- [ ] No navegador, o Usuário escolhe um arquivo pelo botão "Enviar", vê a linha no painel ir de enviando a concluído e vê o arquivo na listagem sem recarregar (teste no Playwright).
- [ ] No navegador, um arquivo maior que 8 MiB mostra o progresso avançando e termina concluído (teste no Playwright).
- [ ] No navegador, um arquivo que não cabe na cota mostra "Sem espaço no seu plano" na linha do painel (teste no Playwright).
- [ ] Um arquivo acima de 5 GB é recusado pela web sem chamar a API, com "O arquivo passa do limite de 5 GB".
- [ ] O cálculo da próxima parte a partir do que o storage recebeu tem teste unitário.
- [ ] As telas batem com o Figma no claro e no escuro, no celular e no desktop, e a validação visual do design system foi feita.
- [ ] O glossário e o LLD refletem as decisões deste ticket.
- [ ] Todas as suítes de teste, a compilação do TypeScript e o lint passam na API e na web, e o build de produção da web passa, dentro dos contêineres.
- [ ] documentação de API => endpoints (dados req, res, header)
- [ ] npm run check:api-doc openapi.json vs código => providencia
- [ ] schema do banco de dados
- [ ] npm run check:schema
- [ ] npm run check:prosa-comment → limpeza
- [ ] contexto externo
- [ ] gates:ci linters, complexidade, api-doc
- [ ] clean arch
- [ ] gates | linters
- [ ] tests
- [ ] hooks UserPrompt → evento auditoria gates →
