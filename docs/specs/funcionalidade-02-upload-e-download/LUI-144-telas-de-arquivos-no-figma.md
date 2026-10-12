# LUI-144 · Telas de arquivos no Figma

> Cópia para conferência, tirada do Linear em 12/10/2026. A fonte é a issue [LUI-144](https://linear.app/argentinaluiz/issue/LUI-144/telas-de-arquivos-no-figma) no Linear; esta cópia não é atualizada quando a issue muda.

| | |
| --- | --- |
| **Tipo** | Ticket |
| **Situação** | Backlog |
| **Labels** | `ready-for-agent`, `Feature` |
| **Spec** | [LUI-142](./LUI-142-spec.md) Funcionalidade 02: upload e download de arquivos |
| **Bloqueado por** | — |
| **Bloqueia** | [LUI-145](./LUI-145-listagem-da-pasta-raiz.md) Listagem da pasta raiz |

---

## Parent

[LUI-142](./LUI-142-spec.md)

## What to build

As telas de upload e download ficam desenhadas no arquivo do Figma do projeto, prontas para a implementação. Este é um ticket de preparação: não altera código.

O que é desenhado:

* **Listagem da pasta raiz:** a tela do Drive com a barra superior (com o e-mail do Usuário e "Sair"), o botão "Enviar" e a lista de arquivos, com as colunas Nome, Tipo, Tamanho e Modificado em, o ícone do tipo e a ação "Baixar" em cada linha.
* **Estado vazio:** "Arraste arquivos para cá ou clique em Enviar".
* **Zona de soltar:** o estado "arrastando sobre", cobrindo a área de conteúdo.
* **Painel de uploads:** aberto e recolhido, com o cabeçalho de resumo ("Enviando 3 de 5") e uma linha em cada estado: na fila, enviando (com o botão de cancelar), retomando, concluído e falhou (com a mensagem e "Tentar de novo"). As mensagens de falha incluem "Sem espaço no seu plano" e "O arquivo passa do limite de 5 GB".
* **Envios incompletos:** como a tela lista os envios interrompidos ao voltar e pede que o Usuário selecione o arquivo de novo, e o aviso quando o arquivo selecionado não é o mesmo.

Regras que valem aqui:

* O design system do projeto é obrigatório: só os tokens e os componentes dele, na seção do Drive. Um componente que falte é acrescentado ao design system e ao Figma na mesma tarefa, seguindo o fluxo de trabalho com o Figma descrito lá.
* Cada tela existe no tema claro e no escuro, e nas larguras de celular e de desktop, com o comportamento responsivo do design system: abaixo de 640px, a lista mostra o nome e, numa segunda linha, tamanho e data, e o painel de uploads ocupa a largura toda, ancorado ao pé da tela.
* Fora do desenho: barra lateral de navegação entre seções, trilha de pastas, "Nova pasta", seleção múltipla, alternância entre lista e grade, ordenação pelo cabeçalho, miniaturas, busca e indicador de cota. A tela não mostra controles de funcionalidades que ainda não existem.

## Acceptance criteria

- [ ] A listagem, o estado vazio, a zona de soltar, o painel de uploads com todos os estados de linha e a lista de envios incompletos estão no arquivo do Figma do projeto.
- [ ] Cada tela existe no tema claro e no escuro, no celular e no desktop.
- [ ] As telas usam só variáveis e componentes do design system, sem valores soltos de cor, tipografia, espaçamento, raio ou sombra.
- [ ] Todo componente novo ou alterado está descrito no documento do design system.
- [ ] Os textos estão em português e usam o vocabulário do glossário.
- [ ] As telas foram aprovadas pelo responsável pelo produto.
