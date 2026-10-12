# LUI-137 · Cadastro e verificação de e-mail

> Cópia para conferência, tirada do Linear em 12/10/2026. A fonte é a issue [LUI-137](https://linear.app/argentinaluiz/issue/LUI-137/cadastro-e-verificacao-de-e-mail) no Linear; esta cópia não é atualizada quando a issue muda.

| | |
| --- | --- |
| **Tipo** | Ticket |
| **Situação** | Done |
| **Labels** | `ready-for-agent`, `Feature` |
| **Spec** | [LUI-133](./LUI-133-spec.md) Funcionalidade 01: cadastro e login com e-mail e senha |
| **Bloqueado por** | [LUI-135](./LUI-135-fundacao-ambiente-banco-e-mail-e-formato-de-erro.md) Fundação: ambiente, banco, e-mail e formato de erro, [LUI-136](./LUI-136-base-da-web-componentes-de-autenticacao-e-testes-no-navegador.md) Base da web: componentes de autenticação e testes no navegador |
| **Bloqueia** | [LUI-138](./LUI-138-entrar-e-sair.md) Entrar e sair, [LUI-141](./LUI-141-limite-de-tentativas-e-ip-real.md) Limite de tentativas e IP real |

---

## Parent

[LUI-133](./LUI-133-spec.md)

## What to build

O visitante cria um Usuário com e-mail e senha, vê a tela "confira seu e-mail", recebe o link de verificação, clica nele e chega à tela de entrar com o aviso de que o e-mail foi verificado. Se o link se perder ou expirar, ele pede o reenvio. Se o link for inválido, expirado ou já usado, vê uma mensagem clara com o caminho para pedir outro.

O cadastro nunca revela se um e-mail já tem Usuário: a resposta é sempre a mesma, e o que muda é o e-mail enviado.

| Situação do e-mail | Efeito | E-mail enviado |
| -- | -- | -- |
| Novo | Cria o Usuário, não verificado, com a data do aceite dos termos | Verificação |
| Já cadastrado, não verificado | Substitui a senha pela nova e invalida os links anteriores | Verificação |
| Já cadastrado e verificado | Nenhum | "Você já tem conta", com os caminhos para entrar e redefinir a senha |

Regras que valem aqui:

* O módulo de usuários é o dono da tabela de Usuários. O módulo de autenticação só a acessa pelo service público dele.
* A tabela de Usuários nasce sem as colunas de plano e de bytes usados.
* O e-mail é gravado sem os espaços das pontas e ignora maiúsculas. Não há normalização por provedor.
* A senha tem de 10 a 128 caracteres, sem regra de composição, com hash Argon2id.
* O token de verificação vale 24 horas e é de uso único. Só o hash é guardado. Emitir um novo apaga os anteriores.
* Verificar não abre Sessão.
* O reenvio responde da mesma forma para e-mail inexistente e para e-mail já verificado, sem enviar verificação.
* A API dispara o e-mail e responde sem esperar o envio terminar. Uma falha de envio só é registrada em log.
* O formulário usa um campo de senha só e mostra a frase de aceite com links para páginas provisórias dos Termos e da Política de Privacidade, sem checkbox.
* A tela de entrar nasce aqui só com o cartão e o aviso de e-mail verificado. O formulário de login vem no ticket de entrar e sair.
* O limite de tentativas não faz parte deste ticket.

## Acceptance criteria

- [ ] O cadastro responde 201 nos três casos: e-mail novo, não verificado e já verificado (teste HTTP).
- [ ] E-mail novo gera um Usuário não verificado e um e-mail de verificação no Mailpit (teste HTTP).
- [ ] Cadastrar de novo um e-mail não verificado faz a senha nova valer e o link anterior devolver `invalid_token` (teste HTTP).
- [ ] Cadastrar um e-mail já verificado envia o e-mail "você já tem conta" e não muda a senha (teste HTTP).
- [ ] O link de verificação funciona uma vez só. Token inexistente, expirado ou já usado devolve `invalid_token` (teste HTTP).
- [ ] O reenvio emite um link novo e invalida o anterior (teste HTTP).
- [ ] O reenvio responde 204 para e-mail inexistente e para e-mail já verificado, sem enviar verificação (teste HTTP).
- [ ] Senha com menos de 10 ou mais de 128 caracteres devolve `validation_error` (teste HTTP).
- [ ] O mesmo e-mail com maiúsculas ou espaços nas pontas é o mesmo Usuário; um endereço com `+` é outro (teste HTTP).
- [ ] No navegador, o visitante se cadastra, lê o link no Mailpit, verifica e chega à tela de entrar com o aviso de sucesso (teste no Playwright).
- [ ] No navegador, um link inválido mostra a tela de link inválido, com o caminho para o reenvio (teste no Playwright).
- [ ] Os erros de preenchimento aparecem junto ao campo, em português.
- [ ] As telas batem com o Figma, e a validação visual do design system foi feita.
- [ ] Todas as suítes de teste, a compilação do TypeScript e o lint passam na API e na web, e o build de produção da web passa, dentro dos contêineres.
