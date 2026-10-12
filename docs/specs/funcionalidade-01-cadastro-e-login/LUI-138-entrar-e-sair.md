# LUI-138 · Entrar e sair

> Cópia para conferência, tirada do Linear em 12/10/2026. A fonte é a issue [LUI-138](https://linear.app/argentinaluiz/issue/LUI-138/entrar-e-sair) no Linear; esta cópia não é atualizada quando a issue muda.

| | |
| --- | --- |
| **Tipo** | Ticket |
| **Situação** | Done |
| **Labels** | `ready-for-agent`, `Feature` |
| **Spec** | [LUI-133](./LUI-133-spec.md) Funcionalidade 01: cadastro e login com e-mail e senha |
| **Bloqueado por** | [LUI-137](./LUI-137-cadastro-e-verificacao-de-e-mail.md) Cadastro e verificação de e-mail |
| **Bloqueia** | [LUI-139](./LUI-139-sessao-que-se-renova.md) Sessão que se renova, [LUI-141](./LUI-141-limite-de-tentativas-e-ip-real.md) Limite de tentativas e IP real |

---

## Parent

[LUI-133](./LUI-133-spec.md)

## What to build

O Usuário verificado entra com e-mail e senha, cai numa página provisória que mostra o e-mail dele e sai pelo botão "Sair". Quem tenta abrir uma página protegida sem Sessão é levado à tela de entrar e, depois de entrar, volta à página que pediu. Quem já tem Sessão e abre a tela de entrar é levado direto ao produto.

Quem erra a senha ou usa um e-mail sem Usuário vê a mesma mensagem. Quem ainda não verificou o e-mail é avisado e pode pedir o reenvio ali mesmo.

Regras que valem aqui:

* O login abre uma Sessão: emite um token de acesso (JWT de 15 minutos, RS256, com o id do Usuário e a expiração) e um token de renovação (valor opaco de 256 bits, válido por 30 dias, guardado só como hash). Os tokens de renovação carregam um identificador de Sessão, gerado no login.
* A API valida o token de acesso só pela assinatura, num guard próprio.
* A rota do Usuário autenticado pertence ao módulo de usuários e devolve só o id e o e-mail.
* Sair apaga os tokens da Sessão e responde 204 mesmo com token inválido ou expirado. As outras Sessões do Usuário continuam.
* Não há limite de Sessões por Usuário.
* Na web, os dois tokens ficam em cookies `HttpOnly`, `Secure` e `SameSite=Lax`. O `Secure` é desligado por variável de ambiente no desenvolvimento, que usa HTTP.
* O Proxy do Next.js (a convenção que substituiu o `middleware` nesta versão) roda antes de cada rota, lê a expiração do token de acesso sem conferir a assinatura, manda para a tela de entrar quem não tem Sessão e tira das telas de autenticação quem tem.
* A web não tem a chave pública e não valida o JWT. Toda página e Server Action protegida passa por uma camada de acesso a dados que consulta o Usuário autenticado na API. O Proxy é um filtro otimista, nunca a única barreira.
* O destino de retorno só aceita caminhos internos.
* A página provisória usa só componentes do design system e será substituída pela listagem de arquivos.
* A renovação da Sessão não faz parte deste ticket: aqui, um token de acesso expirado leva à tela de entrar. O limite de tentativas também fica de fora.

## Acceptance criteria

- [ ] Login com credenciais certas e e-mail verificado devolve o par de tokens (teste HTTP).
- [ ] Senha errada e e-mail inexistente devolvem o mesmo `invalid_credentials` (teste HTTP).
- [ ] Usuário não verificado recebe `email_not_verified` (teste HTTP).
- [ ] A rota do Usuário autenticado devolve id e e-mail com token válido, e `unauthenticated` sem token, com token expirado ou com assinatura inválida (teste HTTP).
- [ ] Sair encerra a Sessão do token e mantém as outras Sessões do mesmo Usuário (teste HTTP).
- [ ] Sair com token inválido ou expirado responde 204 (teste HTTP).
- [ ] No navegador, o Usuário entra, vê o próprio e-mail na página provisória e sai (teste no Playwright).
- [ ] Abrir uma página protegida sem Sessão leva à tela de entrar e, depois do login, de volta à página pedida (teste no Playwright).
- [ ] Um destino de retorno externo é ignorado (teste no Playwright).
- [ ] Abrir a tela de entrar com Sessão leva ao produto (teste no Playwright).
- [ ] Os cookies de token são `HttpOnly` e não aparecem para o JavaScript da página (teste no Playwright).
- [ ] Credenciais inválidas aparecem num aviso acima do formulário, em português.
- [ ] O Usuário não verificado vê o aviso e consegue pedir o reenvio na própria tela de entrar.
- [ ] As telas batem com o Figma, e a validação visual do design system foi feita.
- [ ] Todas as suítes de teste, a compilação do TypeScript e o lint passam na API e na web, e o build de produção da web passa, dentro dos contêineres.
