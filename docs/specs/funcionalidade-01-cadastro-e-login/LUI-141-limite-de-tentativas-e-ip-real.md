# LUI-141 · Limite de tentativas e IP real

> Cópia para conferência, tirada do Linear em 12/10/2026. A fonte é a issue [LUI-141](https://linear.app/argentinaluiz/issue/LUI-141/limite-de-tentativas-e-ip-real) no Linear; esta cópia não é atualizada quando a issue muda.

| | |
| --- | --- |
| **Tipo** | Ticket |
| **Situação** | Done |
| **Labels** | `ready-for-agent`, `Feature` |
| **Spec** | [LUI-133](./LUI-133-spec.md) Funcionalidade 01: cadastro e login com e-mail e senha |
| **Bloqueado por** | [LUI-137](./LUI-137-cadastro-e-verificacao-de-e-mail.md) Cadastro e verificação de e-mail, [LUI-138](./LUI-138-entrar-e-sair.md) Entrar e sair, [LUI-140](./LUI-140-recuperacao-de-senha.md) Recuperação de senha |
| **Bloqueia** | — |

---

## Parent

[LUI-133](./LUI-133-spec.md)

## What to build

Login, cadastro, reenvio de verificação e "esqueci a senha" passam a bloquear o excesso de tentativas. Quem estoura o limite vê, na própria tela, uma mensagem em português dizendo que precisa esperar. O limite por IP usa o IP do navegador de quem está tentando, e não o do servidor da web, para que um abusador não bloqueie todos os outros.

| Rotas | Limite por e-mail | Limite por IP | Janela |
| -- | -- | -- | -- |
| Login | 5 | 20 | 15 minutos |
| Cadastro, reenvio de verificação e "esqueci a senha" | 3 | 10 | 1 hora |

Regras que valem aqui:

* Os contadores ficam no PostgreSQL, por chave e janela, num módulo comum, porque as instâncias da API não compartilham memória.
* A chave por e-mail é o hash do e-mail digitado, exista ou não o Usuário. Assim o bloqueio não revela quem tem cadastro.
* Estourado o limite, a resposta é `rate_limited` até a janela fechar, mesmo com a senha certa. O MVP aceita que um terceiro trave o login de alguém por 15 minutos.
* A web chama a API sempre pelo servidor, então repassa o IP do navegador num cabeçalho, junto com um segredo compartilhado noutro cabeçalho.
* A API só usa o IP repassado quando o segredo confere. Sem ele, vale o IP da conexão, que é o comportamento certo para os apps nativos da fase 2.
* O segredo é uma variável de ambiente nova nos dois projetos, com valor de exemplo no arquivo de exemplo de variáveis.
* Os tetos e as janelas são configuráveis por variável de ambiente, com os valores da tabela como padrão. Os testes os reduzem, em vez de usar um relógio falso.
* O limite geral de requisições por Usuário não faz parte deste ticket.

## Acceptance criteria

- [X] A sexta tentativa de login para o mesmo e-mail dentro da janela devolve `rate_limited`, exista ou não o Usuário (teste HTTP).
- [X] Com o limite estourado, o login com a senha certa também devolve `rate_limited` (teste HTTP).
- [X] O login volta a funcionar quando a janela fecha (teste HTTP).
- [X] O limite de login por IP bloqueia tentativas com e-mails diferentes vindas do mesmo IP (teste HTTP).
- [X] O quarto cadastro, o quarto reenvio e o quarto "esqueci a senha" para o mesmo e-mail dentro da janela devolvem `rate_limited` (teste HTTP).
- [X] Com o segredo correto, o limite por IP conta pelo IP repassado: dois IPs repassados diferentes não se bloqueiam (teste HTTP).
- [X] Sem o segredo, ou com o segredo errado, o IP repassado é ignorado e vale o IP da conexão (teste HTTP).
- [X] No navegador, estourar o limite de login mostra a mensagem em português no aviso acima do formulário (teste no Playwright).
- [X] A resposta de limite estourado não diferencia e-mail existente de inexistente.
- [X] Todas as suítes de teste, a compilação do TypeScript e o lint passam na API e na web, e o build de produção da web passa, dentro dos contêineres.
