# LUI-150 · Retomada de envios

> Cópia para conferência, tirada do Linear em 12/10/2026. A fonte é a issue [LUI-150](https://linear.app/argentinaluiz/issue/LUI-150/retomada-de-envios) no Linear; esta cópia não é atualizada quando a issue muda.

| | |
| --- | --- |
| **Tipo** | Ticket |
| **Situação** | Backlog |
| **Labels** | `ready-for-agent`, `Feature` |
| **Spec** | [LUI-142](./LUI-142-spec.md) Funcionalidade 02: upload e download de arquivos |
| **Bloqueado por** | [LUI-146](./LUI-146-enviar-um-arquivo.md) Enviar um arquivo, [LUI-147](./LUI-147-arrastar-varios-arquivos-e-cancelar.md) Arrastar, vários arquivos e cancelar |
| **Bloqueia** | — |

---

## Parent

[LUI-142](./LUI-142-spec.md)

## What to build

O Usuário não perde um envio por causa da rede nem por fechar a aba. Depois de uma queda de rede, o envio continua sozinho do ponto em que parou. Se as tentativas se esgotam, ele clica em "Tentar de novo" e o envio retoma, sem recomeçar. Se fechou a aba no meio, ao voltar ele vê os envios incompletos, seleciona o arquivo de novo e o envio segue de onde estava.

Regras que valem aqui, todas da seção "Upload em chunks" do LLD:

* **Novas tentativas:** cada parte é tentada até 5 vezes, com espera crescente de 1 a 30 segundos, em falha de rede ou erro do storage.
* **Retomada:** antes de repetir, o navegador pergunta ao storage quanto ele recebeu e continua do byte seguinte. Ele nunca confia no que acha que enviou, e nenhum byte já recebido é reenviado.
* **Estados da linha:** durante as novas tentativas, a linha do painel fica em "retomando". Esgotadas as tentativas, fica em "falhou", com o botão "Tentar de novo", que retoma do ponto em que parou.
* **Sessão expirada:** quando o storage informa que a sessão não existe mais, o navegador cancela o upload e inicia outro para o mesmo arquivo, do zero, sem pedir nada ao Usuário.
* **Rota de retomada:** devolve o id do item, a URL da sessão e a validade de um upload pendente do Usuário. É a mesma sessão do início. Para um item que não está pendente ou é de outro Usuário, responde `not_found`.
* **Depois de fechar a aba:** o navegador guarda no `localStorage` só o id do item e a impressão do arquivo (nome, tamanho e data de modificação). A URL da sessão nunca é guardada, porque quem a tem consegue gravar na sessão.
* **Ao voltar:** a tela lista os envios incompletos e pede que o Usuário selecione o arquivo de novo, já que o navegador não mantém acesso ao arquivo local. Se a impressão bater, o envio retoma. Se não bater, a tela avisa que o arquivo é outro e não envia.
* **Descartar:** o Usuário pode descartar um envio incompleto, o que o cancela e devolve o espaço.
* **Registro limpo:** um envio concluído, cancelado ou que a API não reconhece mais como pendente sai da lista de incompletos.
* **Por Usuário:** os envios incompletos guardados no navegador são de quem os iniciou. Outro Usuário que entre no mesmo navegador não os vê.

## Acceptance criteria

- [ ] A rota de retomada devolve, para um upload pendente, a mesma URL de sessão do início, e enviar o restante dos bytes por ela permite concluir (teste HTTP).
- [ ] A rota de retomada responde `not_found` para um item já ativo, cancelado, inexistente ou de outro Usuário (teste HTTP).
- [ ] No navegador, com a rede cortada no meio de um envio e restabelecida em seguida, o envio termina concluído sem ação do Usuário, e o arquivo aparece na listagem com o tamanho total (teste no Playwright).
- [ ] No navegador, depois da retomada, nenhuma parte é enviada a partir de um byte anterior ao que o storage informou ter recebido (teste no Playwright).
- [ ] No navegador, com a rede cortada por mais tempo que as tentativas, a linha fica em "falhou", e "Tentar de novo" conclui o envio a partir do ponto em que parou (teste no Playwright).
- [ ] No navegador, depois de recarregar a página no meio de um envio, a tela lista o envio incompleto, e selecionar o mesmo arquivo conclui o envio a partir do ponto em que parou (teste no Playwright).
- [ ] No navegador, selecionar um arquivo diferente para um envio incompleto mostra o aviso e não envia (teste no Playwright).
- [ ] No navegador, descartar um envio incompleto o tira da lista e devolve o espaço (teste no Playwright).
- [ ] No navegador, o `localStorage` não contém a URL da sessão em nenhum momento do envio (teste no Playwright).
- [ ] No navegador, com a sessão expirada, o envio recomeça do zero e termina concluído, com um só arquivo na listagem (teste no Playwright).
- [ ] Outro Usuário que entra no mesmo navegador não vê os envios incompletos do anterior (teste no Playwright).
- [ ] A impressão do arquivo e o cálculo da espera entre tentativas têm teste unitário.
- [ ] As telas batem com o Figma no claro e no escuro, no celular e no desktop, e a validação visual do design system foi feita.
- [ ] Todas as suítes de teste, a compilação do TypeScript e o lint passam na API e na web, e o build de produção da web passa, dentro dos contêineres.
