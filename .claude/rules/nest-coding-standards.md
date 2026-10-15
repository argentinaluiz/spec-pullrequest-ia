---
paths:
  - "apps/api/src/**/*.ts"
  - "apps/api/test/**/*.ts"
---

# Padrões de nomes da API

Esta regra registra os nomes que o código da API já usa. O que não está aqui segue o padrão do TypeScript e do Nest. O cliente gerado do Prisma, em `src/generated/`, fica fora dela.

## Idioma

- **Identificadores em inglês:** variáveis, funções, classes, tipos e arquivos.
- **Texto em português:** comentários, mensagens de erro de domínio, mensagens de log e nomes de teste (`describe` e `it`).

## Arquivos

Nome em `kebab-case`, seguido de um sufixo que diz o papel do arquivo. A classe leva o mesmo nome em `PascalCase`, com o papel no fim (`items.service.ts` exporta `ItemsService`). Na dúvida, gere o arquivo com o Nest CLI (`pnpm exec nest g <tipo> <nome>`), que já aplica o padrão. Os papéis que o CLI não gera seguem estes nomes:

| Artefato | Arquivo |
| --- | --- |
| Repository | `items.repository.ts` |
| Entidade | `entities/item.entity.ts` |
| Erro de domínio | `errors/quota-exceeded.error.ts`, no módulo dono da regra |
| Interface de `src/infra/` e a implementação dela | `mail-sender.ts` e `smtp-mail-sender.ts` |
| Configuração de um assunto | `mail.config.ts` |

O arquivo de teste leva o nome do arquivo testado, com o sufixo do nível: `items.service.ts` é coberto por `items.service.spec.ts`.

## Classes e tipos

- **Classe com o papel no fim:** `SessionsService`, `RegisterDto`, `InvalidTokenError`.
- **Interface sem prefixo `I`.** A interface de `src/infra/` tem o nome do que ela faz, e a implementação leva o fornecedor na frente: `MailSender` e `SmtpMailSender`.
- **Conjunto fechado de valores é união de strings em `snake_case`, sem `enum`:** `type EmailTokenType = 'verify_email' | 'reset_password'`.
- **Resultado tipado de um comando** é uma união de strings no passado, que diz o que aconteceu: `'rotated' | 'invalid' | 'reused'`.

## Variáveis e constantes

- **Constante de módulo em `SCREAMING_SNAKE_CASE`:** `API_PREFIX`, `USER_FIELDS`, `INTERNAL_ERROR`.
- **Token de injeção** é um `Symbol` em `SCREAMING_SNAKE_CASE`, com a descrição igual ao nome, exportado junto da interface: `MAIL_SENDER = Symbol('MAIL_SENDER')`.
- **Configuração de um assunto** em `camelCase` com o sufixo `Config`, criada com `registerAs`: `mailConfig`, `rateLimitConfig`.
- **Dependência injetada leva o nome do papel, sem o sufixo do tipo:** `private readonly users: UsersService`, `mailer`, `passwords`, `config`.
- **Booleano** começa com `is`, `has` ou `can`, ou é um adjetivo ou particípio: `isUniqueViolation`, `created`.

## Funções e métodos

- **Repository:** verbo do que o método faz no dado: `findByEmail`, `findOrCreate`, `markEmailVerified`, `deleteAllOfUser`.
- **Leitura de um registro:** a ausência que é resultado de negócio devolve `null` (`findUnique`, `findFirst`). O registro que tem de existir, principalmente dentro de uma transação, usa a variante que lança (`findUniqueOrThrow`, `findFirstOrThrow`). Se outro processo pode apagá-lo, como um Usuário removido depois de emitido o token, a ausência é resultado de negócio, e a leitura devolve `null`.
- **Service:** verbo da ação de negócio, do jeito que o caso de uso é chamado: `register`, `verifyEmail`, `login`, `requestReset`.
