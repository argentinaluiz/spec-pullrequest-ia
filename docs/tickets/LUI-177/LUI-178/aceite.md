# Aceite do LUI-178

Ticket de design: nenhum critério tem marca de teste. O de documento é conferido pela leitura do `docs/design-system.md` no diff do PR, e os de revisão humana, pelo arquivo do Figma. O Figma é a origem do código: os tickets seguintes (LUI-179, LUI-180 e LUI-181) leem daqui o diálogo, o aviso, o menu da linha e o breadcrumb, em vez de cada um desenhar o seu.

A luz e o escuro de cada tela são conferidos trocando o modo da coleção `colors` do frame de Light para Dark: nenhuma camada pode ficar com a cor do tema claro. O que o design system já descreve (`dialog`, `toast`, `button-secondary`) não é redefinido: o ticket leva essas peças ao Figma e acrescenta ao documento só o que falta, que são a variação de seletor de pastas do diálogo, os menus da linha e o breadcrumb sem arrastar e soltar.

## LUI-178-CA1

**Marca:** revisão humana

**Cenário:** Dado o arquivo do Figma depois do ticket, quando o revisor abre a página Componentes, então o `dialog` é um conjunto com as variações de campo de nome (criar e renomear) e de seletor de pastas (mover), cada uma nos estados padrão, com erro e carregando, e a vitrine em Light e em Dark; e, ao inspecionar as camadas, nenhuma cor, tamanho de fonte, raio, espaçamento ou sombra está fora de uma variável ou de um estilo.

## LUI-178-CA2

**Marca:** revisão humana

**Cenário:** Dado o arquivo do Figma depois do ticket, quando o revisor abre a página Componentes, então o `toast` (com a variação de erro, que fica até o usuário fechar) e o `button-secondary` são conjuntos com os estados como variantes e a vitrine em Light e em Dark, sem cor, tamanho de fonte, raio, espaçamento ou sombra fora de uma variável ou de um estilo.

## LUI-178-CA3

**Marca:** revisão humana

**Cenário:** Dado o arquivo do Figma depois do ticket, quando o revisor abre o `menu` da página Componentes, então há o menu da linha de pasta, com "Renomear" e "Mover para…", e o da linha de arquivo, com "Baixar", "Renomear" e "Mover para…", e nenhum dos dois tem "Excluir".

## LUI-178-CA4

**Marca:** revisão humana

**Cenário:** Dado o arquivo do Figma depois do ticket, quando o revisor abre o `breadcrumb` da página Componentes, então ele tem a variante completa e a colapsada, com os trechos do meio em "…" que abre um `menu`, e nenhum trecho aparece como destino de arrastar e soltar.

## LUI-178-CA5

**Marca:** revisão humana

**Cenário:** Dado a página Drive do Figma, quando o revisor abre as telas de pasta, então há, em 390 e em 1280 px, a pasta com conteúdo (breadcrumb, barra de ferramentas com "Nova pasta" e "Enviar", e a lista com pastas e arquivos, uma linha de pasta com o menu "Mais ações" aberto) e a pasta vazia, com o convite para enviar ou criar o primeiro item; e, ao trocar o modo da coleção `colors` de cada frame de Light para Dark, nenhuma camada fica com a cor do tema claro.

## LUI-178-CA6

**Marca:** revisão humana

**Cenário:** Dado a página Drive do Figma, quando o revisor abre as telas dos diálogos, então há, em 390 e em 1280 px, o de nova pasta, o de renomear (com o nome atual selecionado e o erro de nome inválido) e o de mover (seletor no nível inicial "Meus arquivos", em um nível mais fundo com o caminho e com "Carregar mais", e com a pasta movida e as descendentes desabilitadas), todos com o aviso de confirmação do `toast` mostrado numa tela depois da ação; e, ao trocar o modo da coleção `colors` de cada frame de Light para Dark, nenhuma camada fica com a cor do tema claro. Em 390 px os diálogos ocupam a largura total, com margem de 16 px.

## LUI-178-CA7

**Marca:** documento

**Cenário:** Dado o `docs/design-system.md` deste PR, quando a seção "Componentes" é lida, então o `{component.breadcrumb}` não diz mais que cada segmento é destino de arrastar e soltar, o `{component.dialog}` descreve a variação de seletor de pastas (nível a nível, com o caminho do nível, "Carregar mais" e as pastas impedidas desabilitadas), o `{component.menu}` traz as ações da linha de pasta e de arquivo, e cada peça nova cita só tokens das tabelas do documento; e, na seção "Lacunas conhecidas", o item sobre o Figma lista `dialog`, `toast` e `button-secondary` como existentes e as telas de pasta da página Drive.
