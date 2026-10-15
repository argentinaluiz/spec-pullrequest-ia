# Formato do critério e do arquivo de aceite

A skill de plano é a dona deste formato. A página do plano lê o arquivo de aceite com o parser da skill (`scripts/plan.cjs`), e o conferidor do aceite de um projeto pode importar o mesmo parser. O projeto declara a pasta dos aceites no `AGENTS.md`, na lista da skill de plano.

## Critério do ticket

- **ID:** `CA<n>` no ticket, e `<ticket>-CA<n>` fora do gerenciador de issues, como `LUI-146-CA3`. O identificador do ticket tem a forma `PREFIXO-N`: letras maiúsculas e algarismos, começando por uma letra, um hífen e um número, como `LUI-146`; o parser e o script da página só reconhecem essa forma. O número nunca muda: critério novo pega o próximo, e critério removido deixa o número vago.
- **Marca de conferência:** teste HTTP, teste no Playwright, teste de unidade, teste de integração, revisão humana ou documento. Só as quatro primeiras são provadas por teste. A definição de pronto do projeto não é critério de ticket.
- **Formato no ticket:** `- [ ] **CA3** · Texto do critério (teste HTTP).`

## Arquivo de aceite

- **Onde:** `<pasta dos aceites>/<ticket>.md`, um por ticket, permanente. O texto do critério fica só no ticket.
- **Introdução:** o texto antes do primeiro critério, sem os títulos: o que prova cada marca neste ticket e o porquê das decisões que os cenários supõem. A página mostra a introdução antes dos critérios.
- **O que traz, por ID:** um título `## <ticket>-CA<n>` e, abaixo dele, as linhas `**Marca:**` (uma das seis), `**Cenário:**` (Dado, Quando, Então) e, nos critérios de teste, `**Teste previsto:**` (camada, arquivo e nome do teste). O texto de cada linha rotulada vai até a próxima linha rotulada ou o próximo título, e pode ter mais de um parágrafo. Um subtítulo dentro do critério não o encerra: só o título do próximo critério encerra.
- **Sem o texto do critério:** o cenário diz como o critério é provado, e não repete o texto dele.

```markdown
# Aceite do LUI-146

Ticket de exemplo. O CA1 é provado por teste HTTP, e o CA2, pela leitura do diff.

## LUI-146-CA1

**Marca:** teste HTTP

**Cenário:** Dado um Usuário com um item, quando ele o copia, então a cópia é criada com o nome dado.

**Teste previsto:** testes de ponta a ponta da API, `items.e2e-spec.ts`, "copia o item @LUI-146-CA1".

## LUI-146-CA2

**Marca:** documento

**Cenário:** Dado o documento de arquitetura, quando se lê a seção da cópia, então ela descreve a cota.
```

## Congelado depois do commit de plano

O arquivo de aceite não muda depois do commit de plano. Descongelar é do usuário, no editor ou no terminal. O que se congela é o ID e o cenário: o teste previsto é só uma previsão, e não se corrige o arquivo quando o teste muda de nome ou de lugar, porque a ligação é o ID. Como o projeto impõe isso, se impõe, está no `AGENTS.md` dele.

## Teste de aceite

Cada teste de aceite leva no título o token `@<ticket>-CA<n>`, com o `@`, como `@LUI-146-CA3`. O nome e o arquivo do teste podem mudar durante a implementação, porque a ligação com o critério é o ID.
