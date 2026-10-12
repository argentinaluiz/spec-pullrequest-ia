# LUI-139 · Sessão que se renova

> Cópia para conferência, tirada do Linear em 12/10/2026. A fonte é a issue [LUI-139](https://linear.app/argentinaluiz/issue/LUI-139/sessao-que-se-renova) no Linear; esta cópia não é atualizada quando a issue muda.

| | |
| --- | --- |
| **Tipo** | Ticket |
| **Situação** | Done |
| **Labels** | `ready-for-agent`, `Feature` |
| **Spec** | [LUI-133](./LUI-133-spec.md) Funcionalidade 01: cadastro e login com e-mail e senha |
| **Bloqueado por** | [LUI-138](./LUI-138-entrar-e-sair.md) Entrar e sair |
| **Bloqueia** | [LUI-140](./LUI-140-recuperacao-de-senha.md) Recuperação de senha |

---

## Parent

[LUI-133](./LUI-133-spec.md)

## What to build

O Usuário continua dentro depois que o token de acesso de 15 minutos expira, sem perceber e sem digitar a senha de novo, por até 30 dias no mesmo navegador. Ele pode usar o produto em várias abas ao mesmo tempo sem ser derrubado. Quando a Sessão acaba de verdade, por ter expirado ou sido revogada, ele é levado à tela de entrar com o aviso "Sua sessão expirou".

Regras que valem aqui:

* Cada renovação emite um par novo de tokens, na mesma Sessão, e marca o token de renovação antigo como trocado, apontando para o que o substituiu.
* Um token já trocado continua aceito por 10 segundos. Dentro dessa janela, cada uso recebe um par novo e válido, na mesma Sessão. A cadeia bifurca, o último cookie gravado vence e os tokens que sobram expiram sozinhos.
* Depois dos 10 segundos, o reuso de um token trocado encerra todas as Sessões do Usuário, por indicar possível roubo.
* Sair apaga todos os tokens da Sessão, inclusive os ramos criados por renovações simultâneas.
* O Proxy do Next.js faz a renovação antes de a rota renderizar: quando o token de acesso expirou, ele chama a renovação e regrava os cookies. Se a renovação falha, ele apaga os cookies e leva à tela de entrar com o aviso.
* A camada de acesso a dados também encerra a Sessão na web quando a API responde que o Usuário não está autenticado.
* As validades dos tokens e a janela de tolerância são configuráveis por variável de ambiente, com os valores de produção como padrão. Os testes as reduzem, em vez de usar um relógio falso dentro dos services.

## Acceptance criteria

- [X] A renovação devolve um par novo, e o token de acesso novo funciona na rota do Usuário autenticado (teste HTTP).
- [X] O token de renovação antigo, usado de novo dentro da janela de tolerância, recebe outro par válido (teste HTTP).
- [X] O token de renovação antigo, usado depois da janela, é recusado e encerra todas as Sessões do Usuário: nenhum token de renovação dele funciona mais (teste HTTP).
- [X] Um token de renovação expirado ou inexistente devolve `unauthenticated` (teste HTTP).
- [X] Sair depois de renovações simultâneas invalida todos os ramos da Sessão (teste HTTP).
- [X] Sair numa Sessão não afeta a renovação de outra Sessão do mesmo Usuário (teste HTTP).
- [X] No navegador, com o token de acesso expirado e o de renovação válido, a navegação segue sem passar pela tela de entrar (teste no Playwright).
- [X] No navegador, com a Sessão revogada, os cookies são apagados e a tela de entrar mostra "Sua sessão expirou" (teste no Playwright).
- [X] Duas abas navegando ao mesmo tempo com o token de acesso expirado continuam com Sessão (teste no Playwright).
- [X] Todas as suítes de teste, a compilação do TypeScript e o lint passam na API e na web, e o build de produção da web passa, dentro dos contêineres.
