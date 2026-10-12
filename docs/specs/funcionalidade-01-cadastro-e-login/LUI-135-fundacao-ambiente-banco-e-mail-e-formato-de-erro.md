# LUI-135 · Fundação: ambiente, banco, e-mail e formato de erro

> Cópia para conferência, tirada do Linear em 12/10/2026. A fonte é a issue [LUI-135](https://linear.app/argentinaluiz/issue/LUI-135/fundacao-ambiente-banco-e-mail-e-formato-de-erro) no Linear; esta cópia não é atualizada quando a issue muda.

| | |
| --- | --- |
| **Tipo** | Ticket |
| **Situação** | Done |
| **Labels** | `ready-for-agent`, `Feature` |
| **Spec** | [LUI-133](./LUI-133-spec.md) Funcionalidade 01: cadastro e login com e-mail e senha |
| **Bloqueado por** | — |
| **Bloqueia** | [LUI-137](./LUI-137-cadastro-e-verificacao-de-e-mail.md) Cadastro e verificação de e-mail |

---

## Parent

[LUI-133](./LUI-133-spec.md)

## What to build

A base que todas as fatias de autenticação usam. É um ticket de preparação: não entrega comportamento para o Usuário, mas deixa o ambiente e a API prontos para a primeira fatia.

Depois dele, quem clona o repositório sobe o ambiente com o Docker Compose e encontra o banco criado, as migrações aplicadas e os e-mails capturados numa tela local, sem passo manual. A API responde sob `/v1`, valida a entrada e devolve todo erro no formato RFC 9457, com um campo `code` estável. Ela valida as próprias variáveis de ambiente ao subir e se recusa a iniciar quando alguma falta ou vem inválida. Existe uma interface de envio de e-mail com um driver SMTP, e uma base de testes que sobe a aplicação inteira e fala com ela por HTTP.

Decisões que valem aqui:

* O Compose ganha os serviços de PostgreSQL e de Mailpit. Storage e worker não entram.
* O Prisma cuida do esquema e das migrações, aplicadas quando o contêiner da API sobe. As extensões de texto insensível a maiúsculas e de trigramas são habilitadas.
* Um arquivo de exemplo de variáveis de ambiente é versionado com valores que funcionam localmente. Os hosts são sempre os nomes dos serviços do Compose, nunca `localhost`.
* O par de chaves RS256 do JWT é gerado por um script na primeira subida e fica fora do Git.
* Um módulo de config é o único ponto que lê as variáveis de ambiente da API. Ele as valida na subida contra um schema e as entrega ao restante do código por injeção, já tipadas.
* As práticas de código da API (camadas, direção das dependências, erros de domínio traduzidos pelo filtro, nomes de arquivos e níveis de teste) estão no guia de agentes do projeto da API e valem para tudo o que nasce aqui.
* A API passa a ter três suítes, separadas pelo sufixo do arquivo de teste: unidade, integração e ponta a ponta. Os testes HTTP deste ticket e dos seguintes são da suíte de ponta a ponta. A suíte de integração nasce aqui, com o teste da interface de envio de e-mail contra o Mailpit.
* Os testes usam um banco separado no mesmo PostgreSQL, limpo a cada arquivo de teste, e leem os e-mails pela API HTTP do Mailpit. Não há dublês de banco nem de e-mail.
* O controller de exemplo do esqueleto e o teste unitário dele são removidos. A suíte de unidade fica sem nenhum teste e, mesmo assim, tem de passar.

## Acceptance criteria

- [ ] Subir o Compose do zero deixa web, API, PostgreSQL e Mailpit no ar, com as migrações aplicadas, sem passo manual.
- [ ] O arquivo de exemplo de variáveis de ambiente, copiado sem alterações, é suficiente para o ambiente local funcionar.
- [ ] As chaves do JWT são geradas na primeira subida e não aparecem no Git.
- [ ] Com uma variável de ambiente obrigatória ausente ou inválida, a API não sobe e o erro diz qual é a variável (teste de integração).
- [ ] As rotas da API ficam sob `/v1`.
- [ ] Uma entrada inválida devolve `application/problem+json` com `code: validation_error` (teste HTTP).
- [ ] Uma rota inexistente e um erro inesperado também saem no formato RFC 9457, sem vazar detalhes internos (teste HTTP).
- [ ] Um e-mail enviado pela interface de envio aparece no Mailpit (teste de integração).
- [ ] A base de testes sobe a aplicação inteira, usa o banco de testes e o limpa a cada arquivo.
- [ ] As três suítes da API (unidade, integração e ponta a ponta) rodam por comandos próprios, e a de unidade passa mesmo sem nenhum teste.
- [ ] As três suítes, a compilação do TypeScript e o lint passam dentro do contêiner.
- [ ] O guia de agentes da API lista os comandos das três suítes, e a documentação de ambiente do projeto descreve os serviços novos.
