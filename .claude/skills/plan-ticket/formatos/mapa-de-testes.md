# Formato do mapa de testes

Um teste de uma skill não pode levar o ID de um critério do projeto na tag, porque a skill vai com os testes para outros projetos. O mapa de testes liga o critério a esse teste de fora, e o aceite continua congelado. Um teste do projeto continua levando o ID na tag (`formatos/aceite.md`, "Teste de aceite").

## Onde

`<pasta dos tickets>/<pai>/<ticket>/mapa-de-testes.txt`, na pasta do ticket, ao lado do arquivo de aceite (`formatos/aceite.md`, "Onde"). Como o aceite, o mapa é versionado: o `.gitignore` da pasta dos tickets o reinclui (`!<pasta dos tickets>/*/*/mapa-de-testes.txt`). Diferente do aceite, o mapa não é congelado: é a parte viva da ligação, e muda quando o teste muda de nome ou de lugar.

## O que traz

Uma linha por ligação, com três campos separados por uma tabulação:

```text
<ID do critério>	<caminho do arquivo de teste>	<nome do caso>
```

- **ID:** o do critério, como `PROJ-123-CA3`. Tem de estar em algum arquivo de aceite.
- **Arquivo:** o caminho do arquivo de teste, relativo à raiz do repositório.
- **Nome do caso:** o nome do caso, como o relatório da suíte o traz (o título dele, ou o nome completo, com os `describe`).
- As linhas em branco e as que começam com `#` não contam. Um critério pode ter mais de uma linha, e um caso pode estar em mais de um critério.

A linha vale como a tag do caso: o critério fica coberto quando o caso de nome igual, num arquivo que casa com o da linha, rodou e passou. Os dois caminhos casam quando são iguais ou quando um é o fim do outro, numa fronteira de pasta, então a linha pode trazer o caminho como o relatório o mostra.

## Quando o conferidor reclama

Quando o conferidor do aceite diz que um critério de teste não tem teste, e o teste que o prova é de uma skill, ou que um caso do mapa não rodou, ache o caso pelo "Teste previsto" do critério, no arquivo de aceite:

1. Procure, nos arquivos de teste, o nome ou o arquivo que ele dá.
2. **Um candidato só:** escreva a linha no mapa do ticket (crie o mapa, se o ticket não tem) e rode o conferidor de novo.
3. **Nenhum, ou mais de um:** mostre os candidatos (o arquivo e o nome de cada um) à pessoa e pergunte qual prova o critério. Escreva a linha com a resposta.
