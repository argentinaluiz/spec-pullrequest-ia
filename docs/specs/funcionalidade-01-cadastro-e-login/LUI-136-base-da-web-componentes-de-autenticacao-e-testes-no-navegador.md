# LUI-136 · Base da web: componentes de autenticação e testes no navegador

> Cópia para conferência, tirada do Linear em 12/10/2026. A fonte é a issue [LUI-136](https://linear.app/argentinaluiz/issue/LUI-136/base-da-web-componentes-de-autenticacao-e-testes-no-navegador) no Linear; esta cópia não é atualizada quando a issue muda.

| | |
| --- | --- |
| **Tipo** | Ticket |
| **Situação** | Done |
| **Labels** | `ready-for-agent`, `Feature` |
| **Spec** | [LUI-133](./LUI-133-spec.md) Funcionalidade 01: cadastro e login com e-mail e senha |
| **Bloqueado por** | [LUI-134](./LUI-134-telas-de-autenticacao-no-figma.md) Telas de autenticação no Figma |
| **Bloqueia** | [LUI-137](./LUI-137-cadastro-e-verificacao-de-e-mail.md) Cadastro e verificação de e-mail |

---

## Parent

[LUI-133](./LUI-133-spec.md)

## What to build

A base da web que todas as telas de autenticação usam. É um ticket de preparação: não entrega um fluxo para o Usuário, mas deixa prontos os componentes, o acesso à API e os testes no navegador.

Depois dele, existem os primitivos do design system que a autenticação usa (campo de texto, campo de senha com o botão de exibir, botão primário, link de texto e aviso), o cartão de autenticação montado a partir deles, e os tokens do design system disponíveis no Tailwind. Existe um cliente da API que roda só no servidor, com os tipos do contrato de autenticação e a tradução do `code` de erro em mensagem em português. E existe um serviço do Playwright no Compose, com um teste de fumaça que abre a web.

Decisões que valem aqui:

* Os componentes são implementados a partir das telas aprovadas no Figma, seguindo o fluxo "do Figma para o código" e a validação visual do design system.
* Os guias do Next.js que acompanham o pacote instalado são lidos antes de escrever código: a versão tem mudanças em relação ao que é mais conhecido.
* As práticas de código da web (Server Components por padrão, regras de cache, acesso a dados e formulários) estão no guia de agentes do projeto da web e valem para tudo o que nasce aqui. Nenhum cache é criado neste ticket.
* A web chama a API sempre pelo servidor. O endereço da API vem de variável de ambiente e usa o nome do serviço do Compose.
* Os tipos do contrato ficam na própria web; não há pacote compartilhado.
* Os textos são em português, escritos nos componentes, sem biblioteca de tradução.
* O Playwright roda num serviço próprio do Compose, nunca direto na máquina, e tem um auxiliar para ler os e-mails pelo Mailpit.

## Acceptance criteria

- [ ] Os primitivos e o cartão de autenticação existem e batem com as telas do Figma, em desktop e mobile.
- [ ] Os componentes usam só os tokens do design system, sem valores soltos.
- [ ] O campo de senha alterna entre ocultar e exibir.
- [ ] O cliente da API só pode ser usado no servidor e devolve erros tipados pelo `code`.
- [ ] Cada `code` de erro de autenticação tem uma mensagem em português.
- [ ] O serviço do Playwright sobe pelo Compose e um teste de fumaça abre a web e passa.
- [ ] O auxiliar de teste lê um e-mail do Mailpit e extrai um link dele.
- [ ] A validação visual do design system foi feita.
- [ ] Só os componentes que precisam de estado, evento ou API do navegador são componentes de cliente, como o campo de senha com o botão de exibir.
- [ ] O guia de agentes da web lista o comando dos testes no navegador.
- [ ] A compilação do TypeScript, o lint e o build de produção da web passam dentro do contêiner.
