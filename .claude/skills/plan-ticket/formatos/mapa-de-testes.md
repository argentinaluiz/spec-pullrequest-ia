# Formato do mapa de testes

A skill de plano é a dona deste formato. O conferidor do aceite lê o mapa com o parser da skill (`scripts/plan.cjs`, `parseTestMap`), e a `tdd` e o procedimento da `SKILL.md` o gravam.

Um teste de uma skill não pode levar o ID de um critério do projeto na tag (a skill vai com os testes para outros projetos). O mapa de testes liga o critério a esse teste de fora, e o aceite continua congelado.

## Onde

`<pasta dos tickets>/<pai>/<ticket>/mapa-de-testes.txt`, na pasta do ticket, ao lado do arquivo de aceite (`formatos/aceite.md`, "Onde"). Como o aceite, o mapa é versionado: o `.gitignore` da pasta dos tickets o reinclui (`!<pasta dos tickets>/*/*/mapa-de-testes.txt`), e o script da página do plano confere isso. Diferente do aceite, o mapa não é congelado: é a parte viva da ligação, e muda quando o teste muda de nome ou de lugar.

## O que traz

Uma linha por ligação, com três campos separados por uma tabulação:

```text
<ID do critério>	<caminho do arquivo de teste>	<nome do caso>
```

- **ID:** o do critério, como `PROJ-123-CA3`. Tem de estar em algum arquivo de aceite.
- **Arquivo:** o caminho do arquivo de teste, relativo à raiz do repositório.
- **Nome do caso:** o nome do caso, como o relatório da suíte o traz (o título dele, ou o nome completo, com os `describe`).
- As linhas em branco e as que começam com `#` não contam. Um critério pode ter mais de uma linha, e um caso pode estar em mais de um critério.

## Como o conferidor lê

- A linha vale como a tag do caso: o conferidor acha, nos relatórios das suítes, o caso de nome igual, num arquivo que casa com o da linha, e o critério fica coberto quando esse caso rodou e passou. Os dois caminhos casam quando são iguais ou quando um é o fim do outro, numa fronteira de pasta: os relatórios trazem o caminho de jeitos diferentes (absoluto no contêiner, relativo à pasta de testes), e a linha pode trazer o que o relatório mostra.
- **Reprova,** dizendo qual:
  - a linha cujo caso não aparece nos relatórios (com o ID, o arquivo e o nome do caso);
  - a linha cujo ID não está em nenhum arquivo de aceite;
  - a linha mal formada (com o número dela).
- Um teste com o ID na tag continua cobrindo o critério, com ou sem mapa.
