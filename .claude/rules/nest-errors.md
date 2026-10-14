---
paths:
  - "apps/api/src/**/*.service.ts"
  - "apps/api/src/**/*.guard.ts"
  - "apps/api/src/**/*.error.ts"
  - "apps/api/src/common/errors/**"
  - "apps/api/src/infra/**"
---

# Erros da API

Todo retorno de erro sai do exception filter global. Nenhum outro lugar monta resposta de erro.

- **No service e no guard:** uma regra violada lança um erro de domínio, uma classe própria que carrega o `code` estável do contrato (`quota_exceeded`, `invalid_move`) e os dados do caso. O erro não sabe o status HTTP. O `AuthGuard`, que lança `UnauthenticatedError`, é o exemplo do guard.
- **No exception filter:** a resposta HTTP de erro é desenhada num único lugar, o filter global de `src/common/errors/`. Ele traduz o erro de domínio em status e corpo `application/problem+json`, e é ali que mora o mapa de `code` para status da seção 3.1 do `docs/lld.md`.
- **Erro de domínio:** estende `DomainError`, de `src/common/errors/`, e fica no módulo dono da regra. Um `code` novo entra na mesma tarefa no tipo `ErrorCode`, no mapa de status do filter e na tabela da seção 3.1 do LLD. A mensagem do erro vai para o campo `detail` da resposta, então não traz detalhes internos.
- **`HttpException` é só do Nest.** O filter a aceita porque o próprio framework a lança, como na rota inexistente. O código do projeto não a lança.
- **Validação de entrada:** os DTOs são validados por um pipe global, com os decorators do class-validator. O erro dele passa pelo mesmo filter e sai como `validation_error`. Os campos que o DTO não declara são descartados.
- **Erro inesperado:** o filter registra em log e responde 500, sem expor mensagem interna nem stack trace. Isso vale também para o erro de uma biblioteca que traz um `statusCode` próprio: o filter só aceita o status de uma `HttpException` e dos erros do leitor do corpo do Express.
- **Erro de fornecedor:** a implementação de `src/infra/` que recebe um erro com significado para a regra de negócio (objeto inexistente, limite atingido) o converte em erro de domínio. Ela não deixa o erro do SDK subir contando com o status dele.

## Onde diverge da skill `nestjs-best-practices`

Nos pontos abaixo, vale esta regra, e não a skill.

- **`error-throw-http-exceptions`** aceita, e até prefere, `HttpException` no service. Aqui, o service lança erro de domínio.
- **`error-use-exception-filters`** recomenda um filter por tipo de erro, além do global. Aqui, há um filter só, para que o mapa de `code` para status fique num lugar.
