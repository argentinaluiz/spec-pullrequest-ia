---
paths:
  - "apps/api/src/**/*.controller.ts"
---

# Controllers da API

O controller adapta o HTTP: recebe a requisição, valida a entrada pelo DTO, chama o service e devolve o resultado. Ele não decide nada.

- **Uma chamada de service por rota.** Cada rota chama um único método de um service. Uma rota que precisa de vários passos ganha um método de service que os orquestra, porque a sequência faz parte da regra de negócio.
- **Nunca o repository.** O controller não injeta repository, nem o do próprio módulo, nem o `PrismaService`. O dado chega pelo service.
- **Não lança erro.** O controller não lança erro de nenhum tipo, nem `HttpException` (`NotFoundException`, `BadRequestException` etc.). Quem decide que algo deu errado é o service, com um erro de domínio. O erro sobe até o exception filter, que monta a resposta, como descrito em `nest-errors.md`.
- **`try/catch` só para efeito colateral do próprio controller,** como registrar algo ou liberar um recurso aberto na rota. No fim, o `catch` relança o mesmo erro: não devolve valor, não troca o erro por outro e não monta resposta com `res.status(...).json(...)`.

## Onde diverge da skill `nestjs-best-practices`

Nos pontos abaixo, vale esta regra, e não a skill.

- **`arch-single-responsibility`** mostra o controller orquestrando vários services numa rota. Aqui, a rota chama um método de service, e a orquestração fica nele.
- **`error-use-exception-filters`** mostra o controller lançando `NotFoundException`, e **`error-throw-http-exceptions`** aceita `HttpException` no service. Aqui, nenhum dos dois lança `HttpException`: o service lança erro de domínio, e o controller não lança nada.
