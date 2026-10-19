# Aceite do LUI-189

Ticket de documento: muda a skill `/to-tickets` em três pontos e acrescenta ao `AGENTS.md` da raiz a regra de escalonamento. Os quatro critérios são de documento, lidos no diff do PR, e nenhum exige teste: não há código, e o fluxo do ticket sem critério de teste não usa a `tdd`.

A skill `/to-tickets` é genérica (ela vem de fora do projeto e usa o vocabulário do gerenciador de issues configurado), e a mudança não pode amarrá-la a este projeto: ela fala em ticket, bloqueio, decisão compartilhada e onda, sem citar o Linear, os caminhos do repositório nem os identificadores da spec. A regra de escalonamento, que é deste projeto, vai para o `AGENTS.md` da raiz. As decisões compartilhadas são decisões de produto ou de implementação que mais de um ticket teria de tomar, e o critério de paralelismo é a decisão, e não a área, o módulo ou o arquivo.

## LUI-189-CA1

**Marca:** documento

**Cenário:** Dado o diff do PR, quando se lê o passo em que a `/to-tickets` desenha as fatias, então ele manda procurar, entre os tickets sem bloqueio entre si, as decisões que mais de um deles teria de tomar (o mesmo campo, a mesma regra, o mesmo formato de contrato) e dar a cada uma um destino: um ticket anterior que bloqueia os que a usam, ou o encadeamento dos tickets. E diz que um arquivo em comum, sem decisão em comum, não impede o paralelismo, que a área ou o módulo não é critério, e que o ticket não leva caminhos de arquivo possuídos ou proibidos.

## LUI-189-CA2

**Marca:** documento

**Cenário:** Dado o diff do PR, quando se lê o passo em que a `/to-tickets` apresenta a divisão à pessoa, então ele manda mostrar, além da lista de tickets, as ondas calculadas a partir dos bloqueios (o que pode começar junto) e a tabela das decisões compartilhadas, com o destino de cada uma, e manda perguntar à pessoa se os destinos estão certos.

## LUI-189-CA3

**Marca:** documento

**Cenário:** Dado o diff do PR, quando se lê o modelo de issue da `/to-tickets`, então ele traz a seção opcional "Decisões de outros tickets", com as decisões que o ticket consome sem tomar e o ticket dono de cada uma, e diz quando omiti-la (o ticket que não consome decisão de outro).

## LUI-189-CA4

**Marca:** documento

**Cenário:** Dado o diff do PR, quando se lê a seção "Ao trabalhar em um ticket" do `AGENTS.md` da raiz, então ela traz a regra de escalonamento: parar e perguntar diante de uma decisão que não está no ticket nem no plano e que outro ticket em andamento também tomaria, ou diante de mudar algo que outro ticket em andamento usa.
