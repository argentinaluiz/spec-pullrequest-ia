# LUI-147 · Arrastar, vários arquivos e cancelar

> Cópia para conferência, tirada do Linear em 12/10/2026. A fonte é a issue [LUI-147](https://linear.app/argentinaluiz/issue/LUI-147/arrastar-varios-arquivos-e-cancelar) no Linear; esta cópia não é atualizada quando a issue muda.

| | |
| --- | --- |
| **Tipo** | Ticket |
| **Situação** | Backlog |
| **Labels** | `ready-for-agent`, `Feature` |
| **Spec** | [LUI-142](./LUI-142-spec.md) Funcionalidade 02: upload e download de arquivos |
| **Bloqueado por** | [LUI-146](./LUI-146-enviar-um-arquivo.md) Enviar um arquivo |
| **Bloqueia** | [LUI-150](./LUI-150-retomada-de-envios.md) Retomada de envios |

---

## Parent

[LUI-142](./LUI-142-spec.md)

## What to build

O Usuário arrasta arquivos para a tela, ou escolhe vários pelo botão "Enviar", e todos entram numa fila. Três sobem ao mesmo tempo e os demais esperam a vez. O painel de uploads resume o andamento e deixa cancelar qualquer arquivo que ainda não terminou.

Regras que valem aqui:

* **Zona de soltar:** enquanto o Usuário arrasta arquivos sobre a janela, ela cobre a área de conteúdo, no estado "arrastando sobre" do design system. Ao soltar, os arquivos entram na fila.
* **Só arquivos:** pastas arrastadas são ignoradas, e a tela avisa que pastas não são enviadas.
* **Seleção:** o seletor do botão "Enviar" aceita vários arquivos.
* **Fila:** até 3 arquivos enviam ao mesmo tempo. As partes de um mesmo arquivo continuam em sequência, uma por vez.
* **Falha isolada:** um arquivo que falha, por cota, por tamanho ou por rede, não interrompe os outros da fila.
* **Painel de uploads:** o cabeçalho resume o envio ("Enviando 3 de 5") e tem os botões de recolher e de fechar. A lista rola a partir de cinco linhas. A linha ganha o estado "na fila".
* **Cancelar:** a rota de cancelamento remove o item pendente, apaga o que já chegou ao storage e devolve o espaço reservado. Para um item que não está pendente ou é de outro Usuário, responde `not_found`. A linha tem o botão de cancelar enquanto o arquivo está na fila ou enviando. Cancelar um arquivo na fila, que ainda não foi iniciado na API, só o tira da fila.
* **Sair da página:** com envios em andamento, o navegador pede confirmação antes de fechar ou recarregar a aba.

## Acceptance criteria

- [ ] Cancelar um upload pendente responde 204, e o espaço volta a aceitar um upload que antes não caberia (teste HTTP).
- [ ] Depois do cancelamento, concluir o mesmo upload responde `not_found`, e o item não aparece na listagem (teste HTTP).
- [ ] Cancelar um upload de outro Usuário, um item já ativo ou um id inexistente responde `not_found` (teste HTTP).
- [ ] Cancelar um upload com parte dos bytes já enviados deixa a sessão inutilizável para novos envios (teste HTTP).
- [ ] No navegador, soltar arquivos sobre a janela mostra a zona de soltar e inicia os envios (teste no Playwright).
- [ ] No navegador, escolher cinco arquivos de uma vez mostra no máximo três enviando ao mesmo tempo, os demais na fila, e todos terminam na listagem (teste no Playwright).
- [ ] No navegador, o cabeçalho do painel mostra o resumo do envio e o painel pode ser recolhido e reaberto (teste no Playwright).
- [ ] No navegador, cancelar um arquivo em envio tira a linha do andamento, o arquivo não aparece na listagem e os outros seguem (teste no Playwright).
- [ ] No navegador, um arquivo que não cabe na cota falha e os demais da mesma leva são concluídos (teste no Playwright).
- [ ] Arrastar uma pasta não inicia envio e mostra o aviso.
- [ ] As telas batem com o Figma no claro e no escuro, no celular e no desktop, e a validação visual do design system foi feita.
- [ ] Todas as suítes de teste, a compilação do TypeScript e o lint passam na API e na web, e o build de produção da web passa, dentro dos contêineres.
