# Aceite do LUI-163

Ticket de design: nenhum critério tem marca de teste. Os de documento são conferidos pela leitura do `docs/design-system.md` no diff do PR, e os de revisão humana, pelo arquivo do Figma.

## LUI-163-CA1

**Marca:** documento

**Cenário:** Dado o `docs/design-system.md` deste PR, quando a seção "Componentes" é lida, então o `{component.upload-item}` tem um estado de espera pelo arquivo, com o pedido para selecionar o arquivo de novo, o botão de selecionar, o de cancelar e o aviso de arquivo diferente do original; o fim da `{component.file-list}` tem o botão "Carregar mais", com o componente que ele usa; e o `{component.upload-panel}` tem o aviso de que pastas não podem ser enviadas. Cada peça nova cita só tokens das tabelas do documento, e um token novo, se houver, está nas tabelas e no `apps/web/app/globals.css`.

## LUI-163-CA2

**Marca:** revisão humana

**Cenário:** Dado o arquivo do Figma depois do ticket, quando o revisor abre a página Componentes, então ela tem um conjunto, com os estados como variantes e a vitrine em Light e em Dark, para cada componente que as telas do Drive usam: `app-bar`, `sidebar`, `nav-item`, `breadcrumb`, `toolbar`, `account-menu`, `search-input`, `quota-meter`, `segmented-control`, `button-utility`, `menu`, `file-list`, `file-row`, `checkbox`, `empty-state`, `dropzone`, `upload-panel`, `upload-item` e as peças que o CA1 acrescentar; e, ao inspecionar as camadas desses componentes, nenhuma cor, tamanho de fonte, raio, espaçamento ou sombra está fora de uma variável ou de um estilo.

## LUI-163-CA3

**Marca:** revisão humana

**Cenário:** Dado a página Drive do Figma, quando o revisor abre os frames de 390 e de 1280 px, então a casca mostra a barra superior (marca, busca, "Enviar" e o menu da conta, com o botão de menu só em 390 px), a navegação lateral ("Meus arquivos", "Lixeira", o indicador de Cota e "Planos"), o breadcrumb e a barra de ferramentas; em 390 px, um frame mostra a navegação lateral como gaveta aberta; e um frame mostra o menu da conta aberto, com o e-mail, o plano, "Planos" e "Sair".

## LUI-163-CA4

**Marca:** revisão humana

**Cenário:** Dado a página Drive do Figma, quando o revisor abre as telas da lista, então há, em 390 e em 1280 px, a lista com arquivos (com "Carregar mais" no fim e uma linha com o menu "Mais ações" aberto, mostrando "Baixar"), a Pasta raiz vazia e a lista com a zona de soltar ativa sobre ela; e, ao trocar o modo da coleção `colors` de cada frame de Light para Dark, nenhuma camada fica com a cor do tema claro.

## LUI-163-CA5

**Marca:** revisão humana

**Cenário:** Dado a página Drive do Figma, quando o revisor abre as telas do painel de envios, então há, em 390 e em 1280 px, o painel com itens enviando, pausado, concluído, esperando o arquivo de novo (também com o aviso de arquivo diferente) e falhou, este com o erro de Cota, o de arquivo grande demais e o de tamanho divergente, e o painel com o aviso de pasta solta; e, ao trocar o modo da coleção `colors` de cada frame de Light para Dark, nenhuma camada fica com a cor do tema claro.

## LUI-163-CA6

**Marca:** documento

**Cenário:** Dado o `docs/design-system.md` deste PR, quando a seção "Lacunas conhecidas" é lida, então o item que diz o que o Figma já tem cita a página Drive e os componentes acrescentados pelo CA2, e deixa de dizer que a página Drive está vazia.
