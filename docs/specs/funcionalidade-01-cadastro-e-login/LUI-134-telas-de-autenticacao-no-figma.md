# LUI-134 · Telas de autenticação no Figma

> Cópia para conferência, tirada do Linear em 12/10/2026. A fonte é a issue [LUI-134](https://linear.app/argentinaluiz/issue/LUI-134/telas-de-autenticacao-no-figma) no Linear; esta cópia não é atualizada quando a issue muda.

| | |
| --- | --- |
| **Tipo** | Ticket |
| **Situação** | Done |
| **Labels** | `ready-for-agent`, `Feature` |
| **Spec** | [LUI-133](./LUI-133-spec.md) Funcionalidade 01: cadastro e login com e-mail e senha |
| **Bloqueado por** | — |
| **Bloqueia** | [LUI-136](./LUI-136-base-da-web-componentes-de-autenticacao-e-testes-no-navegador.md) Base da web: componentes de autenticação e testes no navegador |

---

## Parent

[LUI-133](./LUI-133-spec.md)

## What to build

Todos os estados do cartão de autenticação desenhados no Figma, em desktop e mobile, seguindo o design system do projeto e o fluxo de trabalho com o Figma que ele define. As telas da web só começam a ser implementadas depois que estas forem aprovadas.

Estados a desenhar:

* **Entrar:** o formulário, os avisos "e-mail verificado", "senha redefinida" e "sua sessão expirou", e os erros de credenciais inválidas, de e-mail não verificado (com a ação de reenviar) e de limite de tentativas.
* **Criar conta:** o formulário com um campo de senha só, a frase de aceite com os links dos Termos e da Política de Privacidade, sem checkbox, e os erros por campo.
* **Confira seu e-mail:** a confirmação do cadastro, com a ação de reenviar.
* **Link inválido ou expirado:** para verificação e para redefinição, com o caminho para pedir outro.
* **Esqueci minha senha:** o formulário e a confirmação de envio.
* **Nova senha:** o formulário de redefinição.

Este ticket termina com a aprovação humana das telas. A página provisória pós-login e os e-mails transacionais não têm tela no Figma.

## Acceptance criteria

- [X] Todos os estados listados existem no Figma, em desktop e mobile.
- [X] As telas usam só os tokens e os componentes do design system, sem valores soltos.
- [X] Erros de campo aparecem junto ao campo, e os demais num aviso acima do formulário.
- [X] Cada tela tem o link para o fluxo vizinho (entrar, criar conta, esqueci minha senha).
- [X] Se algum componente ou token novo foi necessário, o documento do design system foi atualizado junto.
- [X] As telas foram aprovadas pelo responsável pelo produto.
