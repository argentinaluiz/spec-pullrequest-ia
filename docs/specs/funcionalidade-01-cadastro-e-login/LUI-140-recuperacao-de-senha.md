# LUI-140 · Recuperação de senha

> Cópia para conferência, tirada do Linear em 12/10/2026. A fonte é a issue [LUI-140](https://linear.app/argentinaluiz/issue/LUI-140/recuperacao-de-senha) no Linear; esta cópia não é atualizada quando a issue muda.

| | |
| --- | --- |
| **Tipo** | Ticket |
| **Situação** | Done |
| **Labels** | `ready-for-agent`, `Feature` |
| **Spec** | [LUI-133](./LUI-133-spec.md) Funcionalidade 01: cadastro e login com e-mail e senha |
| **Bloqueado por** | [LUI-139](./LUI-139-sessao-que-se-renova.md) Sessão que se renova |
| **Bloqueia** | [LUI-141](./LUI-141-limite-de-tentativas-e-ip-real.md) Limite de tentativas e IP real |

---

## Parent

[LUI-133](./LUI-133-spec.md)

## What to build

O Usuário que esqueceu a senha informa o e-mail, vê a confirmação de envio, recebe um link, define uma senha nova e é levado à tela de entrar com o aviso de que a senha foi redefinida. Ele entra com a senha nova. Se o link for inválido, expirado ou já usado, vê uma mensagem clara com o caminho para pedir outro.

O pedido nunca revela se o e-mail tem Usuário, nem pela resposta nem pelo tempo que ela leva.

Regras que valem aqui:

* O pedido responde da mesma forma para e-mail existente e inexistente, e só envia e-mail no primeiro caso.
* A API dispara o e-mail e responde sem esperar o envio terminar.
* O token de redefinição vale 1 hora e é de uso único. Só o hash é guardado. Pedir um link novo invalida o anterior.
* A senha nova segue a mesma regra do cadastro: de 10 a 128 caracteres, sem regra de composição.
* A redefinição encerra todas as Sessões do Usuário e não abre uma nova.
* A redefinição funciona para Usuário não verificado e também o marca como verificado, porque a pessoa provou que controla a caixa de e-mail.
* Depois da redefinição, o Usuário recebe o e-mail "sua senha foi alterada".
* O módulo de autenticação troca a senha pelo service público do módulo de usuários.
* O limite de tentativas não faz parte deste ticket.

## Acceptance criteria

- [X] O pedido responde 204 para e-mail existente e inexistente, e só o primeiro gera e-mail no Mailpit (teste HTTP).
- [X] Pedir um link novo faz o anterior devolver `invalid_token` (teste HTTP).
- [X] O link funciona uma vez só. Token inexistente, expirado ou já usado devolve `invalid_token` (teste HTTP).
- [X] Depois da redefinição, a senha antiga devolve `invalid_credentials` e a nova abre uma Sessão (teste HTTP).
- [X] Depois da redefinição, nenhum token de renovação anterior do Usuário funciona (teste HTTP).
- [X] A redefinição não devolve tokens (teste HTTP).
- [X] Um Usuário não verificado que redefine a senha consegue entrar em seguida (teste HTTP).
- [X] O e-mail "sua senha foi alterada" chega ao Mailpit depois da redefinição (teste HTTP).
- [X] Senha nova fora da regra devolve `validation_error` e não consome o link (teste HTTP).
- [X] No navegador, o Usuário pede o link, lê o e-mail no Mailpit, define a senha nova, vê o aviso na tela de entrar e entra com ela (teste no Playwright).
- [X] No navegador, um link inválido mostra a tela de link inválido, com o caminho para pedir outro (teste no Playwright).
- [X] A tela de entrar tem o link "Esqueci minha senha".
- [X] As telas batem com o Figma, e a validação visual do design system foi feita.
- [X] Todas as suítes de teste, a compilação do TypeScript e o lint passam na API e na web, e o build de produção da web passa, dentro dos contêineres.
