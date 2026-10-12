# LUI-133 · Funcionalidade 01: cadastro e login com e-mail e senha

> Cópia para conferência, tirada do Linear em 12/10/2026. A fonte é a issue [LUI-133](https://linear.app/argentinaluiz/issue/LUI-133/funcionalidade-01-cadastro-e-login-com-e-mail-e-senha) no Linear; esta cópia não é atualizada quando a issue muda.

| | |
| --- | --- |
| **Tipo** | Spec |
| **Situação** | Backlog |
| **Labels** | `ready-for-agent`, `Feature` |
| **Tickets** | [LUI-134](./LUI-134-telas-de-autenticacao-no-figma.md) Telas de autenticação no Figma<br>[LUI-135](./LUI-135-fundacao-ambiente-banco-e-mail-e-formato-de-erro.md) Fundação: ambiente, banco, e-mail e formato de erro<br>[LUI-136](./LUI-136-base-da-web-componentes-de-autenticacao-e-testes-no-navegador.md) Base da web: componentes de autenticação e testes no navegador<br>[LUI-137](./LUI-137-cadastro-e-verificacao-de-e-mail.md) Cadastro e verificação de e-mail<br>[LUI-138](./LUI-138-entrar-e-sair.md) Entrar e sair<br>[LUI-139](./LUI-139-sessao-que-se-renova.md) Sessão que se renova<br>[LUI-140](./LUI-140-recuperacao-de-senha.md) Recuperação de senha<br>[LUI-141](./LUI-141-limite-de-tentativas-e-ip-real.md) Limite de tentativas e IP real |

---

## Problem Statement

Quem chega ao gerenciador de arquivos não tem como se identificar. Sem isso, nada do que o produto promete existe: não há a quem pertencer um arquivo, não há cota para medir e não há plano para contratar. Hoje o repositório tem só o esqueleto da web e da API, sem banco, sem e-mail e sem nenhuma rota de negócio.

A pessoa precisa criar o próprio acesso com e-mail e senha, provar que o e-mail é dela, entrar, continuar dentro sem digitar a senha a cada 15 minutos, sair quando quiser e recuperar o acesso se esquecer a senha. E precisa fazer isso num produto cuja primeira promessa é privacidade: o cadastro e a recuperação de senha não podem revelar a terceiros quem usa o serviço.

## Solution

O visitante cria um Usuário informando e-mail e senha. Ele recebe um e-mail com um link de verificação e, depois de clicar, entra com as credenciais. A partir daí tem uma Sessão naquele navegador, que dura até 30 dias e se renova sozinha enquanto ele usa o produto. Ele pode sair, o que encerra só aquela Sessão.

Se esquecer a senha, pede um link por e-mail, define uma senha nova e entra de novo. A redefinição encerra todas as Sessões e avisa o dono por e-mail que a senha mudou.

Em nenhum desses fluxos o produto diz a quem pergunta se um e-mail tem ou não Usuário: o cadastro, o reenvio de verificação e o "esqueci a senha" respondem sempre da mesma forma, e o que muda é o e-mail que chega à caixa do dono.

Depois de entrar, o Usuário cai numa página provisória com o e-mail dele e o botão "Sair". Ela será substituída pela listagem de arquivos quando essa funcionalidade existir.

## User Stories

**Cadastro**

 1. Como visitante, quero criar um Usuário com e-mail e senha, para começar a guardar meus arquivos.
 2. Como visitante, quero digitar a senha uma vez só e poder exibi-la, para conferir o que digitei sem preencher um campo de confirmação.
 3. Como visitante, quero saber as regras da senha antes de enviar o formulário, para não ser recusado por tentativa e erro.
 4. Como visitante, quero usar uma senha longa, de até 128 caracteres e sem exigência de símbolos, para poder usar uma frase ou um gerenciador de senhas.
 5. Como visitante, quero ver os erros de preenchimento ao lado do campo errado, para corrigir sem procurar.
 6. Como visitante, quero ver os links dos Termos e da Política de Privacidade na tela de cadastro, para saber com o que estou concordando.
 7. Como visitante, quero que meu e-mail seja aceito com letras maiúsculas ou espaços nas pontas, para não ser barrado por um detalhe de digitação.
 8. Como visitante, quero uma tela que me diga para conferir meu e-mail depois do cadastro, para saber qual é o próximo passo.
 9. Como dono de um e-mail, quero que ninguém descubra pelo cadastro se eu uso o serviço, para manter minha privacidade.
10. Como Usuário já verificado, quero receber um e-mail de aviso quando alguém tentar se cadastrar com meu e-mail, para saber que já tenho acesso e como entrar ou redefinir a senha.
11. Como dono de um e-mail, quero que meu cadastro valha mesmo que um estranho tenha cadastrado meu e-mail antes sem verificar, para que a senha válida seja a minha.
12. Como responsável pelo produto, quero registrar quando cada Usuário aceitou os termos, para ter a evidência que a LGPD pede.

**Verificação de e-mail**

13. Como visitante, quero receber um e-mail com um link de verificação, para provar que o e-mail é meu.
14. Como visitante, quero que clicar no link me leve ao login com um aviso de sucesso, para saber que posso entrar.
15. Como visitante, quero pedir o reenvio do e-mail de verificação, para não ficar preso se o link expirar ou a mensagem se perder.
16. Como visitante, quero uma mensagem clara quando o link for inválido, expirado ou já usado, com um caminho para pedir outro, para saber como seguir.
17. Como dono de um e-mail, quero que só o link mais recente funcione, para que links antigos esquecidos na caixa não sirvam a ninguém.
18. Como dono de um e-mail, quero que a verificação não abra uma Sessão sozinha, para que um link vazado não dê acesso aos meus arquivos.
19. Como dono de um e-mail, quero que ninguém descubra pelo reenvio se meu e-mail tem Usuário, para manter minha privacidade.

**Login**

20. Como Usuário, quero entrar com e-mail e senha, para acessar meus arquivos.
21. Como Usuário, quero a mesma mensagem de erro para e-mail inexistente e senha errada, para que ninguém descubra quais e-mails têm Usuário.
22. Como Usuário ainda não verificado, quero ser avisado de que preciso verificar o e-mail e poder pedir o reenvio ali mesmo, para resolver sem sair da tela.
23. Como Usuário, quero que as tentativas de login no meu e-mail sejam limitadas, para dificultar que adivinhem minha senha.
24. Como Usuário, quero saber quando estou bloqueado por excesso de tentativas, para entender por que a senha certa não funciona.
25. Como Usuário, quero voltar à página que tentei abrir antes de entrar, para não perder o caminho.
26. Como Usuário já com Sessão, quero ser levado direto ao produto ao abrir a tela de login, para não entrar duas vezes.
27. Como Usuário, quero ver meu e-mail na tela depois de entrar, para confirmar em qual Usuário estou.

**Sessão**

28. Como Usuário, quero continuar dentro enquanto uso o produto, para não digitar a senha a cada 15 minutos.
29. Como Usuário, quero que a Sessão dure até 30 dias no mesmo navegador, para não entrar de novo toda vez que volto.
30. Como Usuário, quero usar o produto em várias abas ao mesmo tempo sem ser derrubado, para trabalhar do meu jeito.
31. Como Usuário, quero ter Sessões em mais de um navegador ao mesmo tempo, para usar o produto no computador e no celular.
32. Como Usuário, quero que meus tokens fiquem fora do alcance do JavaScript da página, para que um script malicioso não roube minha Sessão.
33. Como Usuário, quero que todas as minhas Sessões sejam encerradas se um token de renovação antigo for reutilizado, para me proteger de um possível roubo.
34. Como Usuário, quero ser levado ao login com o aviso "Sua sessão expirou" quando a Sessão acabar, para entender o que aconteceu.
35. Como visitante sem Sessão, quero ser levado ao login ao abrir uma página protegida, para não ver uma tela quebrada.

**Logout**

36. Como Usuário, quero sair, para encerrar a Sessão num computador compartilhado.
37. Como Usuário, quero que sair num navegador não me derrube nos outros, para continuar usando onde estou.
38. Como Usuário, quero que sair funcione mesmo com a Sessão já expirada, para nunca ficar preso numa tela.

**Recuperação de senha**

39. Como Usuário, quero pedir um link de redefinição pelo meu e-mail, para recuperar o acesso quando esquecer a senha.
40. Como dono de um e-mail, quero que ninguém descubra pelo "esqueci a senha" se meu e-mail tem Usuário, nem pela resposta nem pelo tempo que ela leva, para manter minha privacidade.
41. Como Usuário, quero definir uma senha nova a partir do link, para voltar a entrar.
42. Como Usuário, quero que o link de redefinição valha por pouco tempo e uma vez só, para que ele não sirva a mais ninguém depois.
43. Como Usuário, quero que redefinir a senha encerre todas as minhas Sessões, para expulsar quem possa estar usando a senha antiga.
44. Como Usuário, quero receber um e-mail quando minha senha for alterada, para perceber se não fui eu.
45. Como Usuário que nunca verificou o e-mail, quero conseguir redefinir a senha e sair verificado, para não ficar num beco se perdi o e-mail de verificação e a senha.
46. Como Usuário, quero ser levado ao login depois de redefinir a senha, para entrar com a senha nova.
47. Como Usuário, quero uma mensagem clara quando o link de redefinição for inválido ou expirado, com um caminho para pedir outro.

**Interface**

48. Como visitante, quero telas de autenticação simples, com um cartão centrado, para não me perder.
49. Como visitante, quero usar as telas de autenticação pelo celular, para criar meu Usuário de onde estiver.
50. Como visitante, quero todas as mensagens em português, para entender o que deu errado.
51. Como visitante, quero ir do login ao cadastro e ao "esqueci a senha" por links na própria tela, para trocar de fluxo sem voltar.

**Operação e desenvolvimento**

52. Como desenvolvedor, quero subir o ambiente inteiro com o Docker Compose, com banco, migrações e e-mail funcionando sem passo manual, para começar a trabalhar na hora.
53. Como desenvolvedor, quero ver os e-mails enviados numa tela local, para testar os fluxos sem um provedor real.
54. Como desenvolvedor, quero um arquivo de exemplo de variáveis de ambiente que já funcione localmente, para não descobrir a configuração por tentativa e erro.
55. Como desenvolvedor, quero que todo erro da API tenha um código estável, para a web traduzi-lo sem depender do texto.
56. Como desenvolvedor dos apps nativos da fase 2, quero uma API de autenticação que não dependa da web, para reutilizá-la.
57. Como operador, quero que o limite por IP use o IP real da pessoa, e não o do servidor da web, para um abusador não bloquear todos os outros.
58. Como operador, quero que as falhas de envio de e-mail fiquem em log, para investigar quando alguém reclamar que não recebeu.
59. Como operador, quero trocar o provedor de e-mail sem alterar as regras de negócio, para não ficar preso a um fornecedor.

## Implementation Decisions

**Módulos**

* **Módulo de usuários (novo):** dono da tabela de Usuários e da rota que devolve o Usuário autenticado. Expõe um service público com as operações que os outros módulos precisam: criar, buscar por e-mail, marcar como verificado e trocar o hash da senha.
* **Módulo de autenticação (novo):** dono das Sessões e dos tokens de e-mail. Implementa cadastro, verificação, reenvio, login, renovação, logout e recuperação de senha. Só acessa Usuários pelo service público do módulo de usuários, nunca pela tabela.
* **Limite de tentativas (novo, comum):** contadores por chave e janela, guardados no PostgreSQL, porque as instâncias não compartilham memória.
* **E-mail (novo, infraestrutura):** uma interface de envio com um driver SMTP. As regras de negócio só conhecem a interface.
* **Erros (novo, comum):** um filtro que converte toda falha no formato RFC 9457, com um campo `code` estável. As regras de negócio lançam erros de domínio, que carregam o `code` e não conhecem o HTTP; só o filtro monta a resposta.
* **Configuração (novo):** um módulo de config, o único ponto que lê as variáveis de ambiente da API. Ele as valida na subida contra um schema, e a API não inicia com uma variável ausente ou inválida.
* **Web:** cliente da API usado só no servidor, guarda dos cookies de token, uma camada de acesso a dados que confere a Sessão na API, o Proxy do Next.js e as telas de autenticação.
* **Práticas de código:** as regras de como o código é escrito ficam no guia de agentes de cada projeto, e não nesta spec. Na API: camadas, direção das dependências, tratamento de erros, nomes de arquivos e níveis de teste. Na web: Server Components por padrão, cache, acesso a dados e formulários.

**Esquema**

* **Usuários:** id (UUID v7 gerado pela aplicação), e-mail único e insensível a maiúsculas, hash da senha, data da verificação do e-mail, data do aceite dos termos e datas de criação e atualização. As colunas de plano e de bytes usados **não** entram agora; a funcionalidade de cota as acrescenta.
* **Tokens de renovação:** Usuário, identificador da Sessão, hash do token (único), validade, data da troca e o token que o substituiu. Todos os tokens emitidos a partir de um mesmo login carregam o mesmo identificador de Sessão.
* **Tokens de e-mail:** Usuário, tipo (verificação ou redefinição), hash do token (único), validade e data de uso. Emitir um token apaga os anteriores do mesmo Usuário e tipo.
* **Limites:** chave, início da janela e contador.
* Nomes em inglês e `snake_case`, datas em UTC com fuso. Só o hash dos tokens é guardado.

**Contrato da API**

Todas as rotas ficam sob `/v1`, com JSON em `camelCase`.

| Rota | Entrada | Saída |
| -- | -- | -- |
| `POST /auth/register` | `email`, `password` | 201 em todos os casos |
| `POST /auth/verify-email` | `token` | 204, sem abrir Sessão |
| `POST /auth/resend-verification` | `email` | 204 em todos os casos |
| `POST /auth/login` | `email`, `password` | `accessToken`, `refreshToken`, `expiresIn` |
| `POST /auth/refresh` | `refreshToken` | Novo par de tokens |
| `POST /auth/logout` | `refreshToken` | 204, mesmo com token inválido |
| `POST /auth/forgot-password` | `email` | 204 em todos os casos |
| `POST /auth/reset-password` | `token`, `password` | 204, sem abrir Sessão |
| `GET /me` |  | `id`, `email` |

Códigos de erro usados: `validation_error` (400), `invalid_token` (400), `unauthenticated` (401), `invalid_credentials` (401), `email_not_verified` (403) e `rate_limited` (429).

**Regras do cadastro**

* E-mail novo: cria o Usuário, não verificado, grava o aceite dos termos e envia o e-mail de verificação.
* E-mail já cadastrado e não verificado: substitui a senha pela nova, invalida os links anteriores e envia nova verificação. O último cadastro vence.
* E-mail já cadastrado e verificado: não altera nada e envia o e-mail "você já tem conta".
* Risco residual aceito: se um estranho se cadastrar depois do dono e o dono clicar no link do estranho, o Usuário fica verificado com a senha do estranho. O Usuário está vazio, o dono não consegue entrar, e a redefinição de senha troca a senha e encerra todas as Sessões.
* O e-mail é gravado sem os espaços das pontas. Não há normalização por provedor: endereços com `+` são Usuários diferentes.
* A senha tem de 10 a 128 caracteres, sem regra de composição, com hash Argon2id.

**Regras de verificação e de senha**

* Usuário não verificado não entra. Não existe Sessão limitada.
* O token de verificação vale 24 horas, e o de redefinição, 1 hora. Os dois são de uso único.
* A redefinição funciona para Usuário não verificado e também o marca como verificado.
* A redefinição encerra todas as Sessões, não abre uma nova e envia o e-mail "sua senha foi alterada".

**Regras da Sessão**

* O token de acesso é um JWT de 15 minutos, assinado com RS256, com o id do Usuário e a expiração. A API o valida só pela assinatura.
* O token de renovação é um valor opaco de 256 bits, válido por 30 dias e trocado a cada uso.
* Um token já trocado continua aceito por 10 segundos. Dentro dessa janela, cada uso recebe um par novo e válido, na mesma Sessão. Depois dela, o reuso encerra todas as Sessões do Usuário.
* Sair apaga todos os tokens da Sessão, inclusive os ramos criados por renovações simultâneas.
* Não há limite de Sessões por Usuário.

**Limite de tentativas**

* Login: 5 por e-mail e 20 por IP a cada 15 minutos.
* Cadastro, reenvio de verificação e "esqueci a senha": 3 por e-mail e 10 por IP a cada hora.
* A chave por e-mail é o hash do e-mail digitado, exista ou não o Usuário.
* Estourado o limite, a resposta é `rate_limited` até a janela fechar, mesmo com a senha certa. O MVP aceita que um terceiro trave o login de alguém por 15 minutos.

**IP do usuário**

* A web chama a API sempre pelo servidor, então repassa o IP do navegador num cabeçalho, junto com um segredo compartilhado noutro cabeçalho.
* A API só usa o IP repassado quando o segredo confere. Sem ele, vale o IP da conexão, que é o comportamento certo para os apps nativos.

**Envio de e-mail**

* A API dispara o envio e responde sem esperar que ele termine. Isso evita que o tempo de resposta revele se o e-mail existe.
* Uma falha de envio só é registrada em log; o Usuário usa o reenvio.
* São quatro mensagens, em texto simples com a marca: verificação, "você já tem conta", redefinição de senha e "sua senha foi alterada".

**Web**

* Os dois tokens ficam em cookies `HttpOnly`, `Secure` e `SameSite=Lax`. O `Secure` é desligado por variável de ambiente no desenvolvimento, que usa HTTP.
* O Proxy do Next.js (a convenção que substituiu o `middleware` nesta versão) roda antes de cada rota. Ele lê a expiração do token de acesso sem conferir a assinatura, renova os cookies quando o token expirou, manda para o login quem não tem Sessão e tira das telas de autenticação quem tem.
* Se a renovação falha, o Proxy apaga os cookies e leva ao login com o aviso "Sua sessão expirou".
* A web não tem a chave pública e não valida o JWT. Toda página e Server Action protegida passa pela camada de acesso a dados, que consulta o Usuário autenticado na API. O Proxy é um filtro otimista, nunca a única barreira.
* O destino de retorno após o login só aceita caminhos internos.
* Os formulários usam Server Actions com `useActionState` e validação em zod. Os textos são em português, escritos nos componentes, e a web traduz o `code` do erro em mensagem.
* Erros de campo aparecem junto ao campo. Os demais aparecem num aviso acima do formulário.
* As telas seguem o cartão de autenticação do design system e são desenhadas no Figma antes da implementação: entrar, criar conta, confira seu e-mail, link inválido ou expirado, esqueci minha senha (e a confirmação de envio) e nova senha.
* A tela de cadastro mostra a frase de aceite com links para os Termos e a Política de Privacidade, sem checkbox. As duas páginas são provisórias.
* A página provisória pós-login mostra o e-mail do Usuário e o botão "Sair", só com componentes do design system.

**Fundação**

* O Compose ganha os serviços de banco (PostgreSQL) e de captura de e-mail (Mailpit). Os serviços de storage e de worker não entram.
* O Prisma cuida do esquema e das migrações, aplicadas quando o contêiner da API sobe.
* Um arquivo de exemplo de variáveis de ambiente é versionado com valores que funcionam localmente. Os hosts são sempre os nomes dos serviços do Compose.
* O par de chaves do JWT é gerado por um script na primeira subida e fica fora do Git.
* As validades dos tokens e as janelas do limite são configuráveis por variável de ambiente, com os valores de produção como padrão.
* Os tipos do contrato ficam duplicados na web e na API. O pacote compartilhado e o workspace na raiz ficam para depois.

**Ordem de execução**

1. Fundação.
2. Cadastro e verificação.
3. Sessão.
4. Recuperação de senha.
5. Telas no Figma, em paralelo com os passos 1 a 4.
6. Web, depois que o contrato estiver implementado e as telas aprovadas.

## Testing Decisions

**O que é um bom teste aqui**

Um bom teste exercita o comportamento pela mesma porta que um cliente real usa e confere só o que esse cliente consegue observar: a resposta HTTP, o e-mail que chegou e o que a requisição seguinte passa a devolver. Ele não espia services, repositories nem linhas do banco, e não usa dublês de banco ou de e-mail. Assim os testes sobrevivem a qualquer reorganização interna dos módulos.

**Costura 1: HTTP da API**

* Os testes sobem a aplicação inteira e falam só pelas rotas `/v1`.
* O banco é o PostgreSQL real do Compose, num banco de testes separado, limpo a cada arquivo de teste.
* O e-mail é o Mailpit real. Os testes leem as mensagens pela API HTTP dele para conferir o que foi enviado e extrair os links.
* Os prazos são testados reduzindo as variáveis de ambiente de validade e de janela no ambiente de teste, sem relógio falso dentro dos services.
* Cobre todas as regras do contrato: os três casos do cadastro, a substituição da senha de um Usuário não verificado, a verificação e o reenvio, o login e seus erros, a renovação, a janela de 10 segundos e o reuso, o logout da Sessão inteira, a recuperação de senha e seus efeitos, os limites de tentativas e o IP repassado com e sem o segredo.
* Cobre também a fundação: o formato dos erros e a validação de entrada.
* Na convenção de níveis de teste da API, estes são os testes de ponta a ponta.

**Costura 2: navegador**

* O Playwright roda num serviço próprio do Compose, contra a web e a API reais, e lê os e-mails pelo Mailpit.
* Cobre o que só existe na web: o fluxo completo de cadastro, verificação, login e logout; o fluxo completo de recuperação de senha; a proteção de rota e a volta ao destino; o redirecionamento de quem já tem Sessão; a renovação transparente com o token de acesso expirado; a Sessão revogada levando ao login com o aviso; os cookies `HttpOnly`; e as mensagens de erro em português.

**Integração da infraestrutura**

* As peças de infraestrutura que nenhuma rota exercita sozinha na fundação têm teste de integração, contra a dependência real: a interface de envio de e-mail contra o Mailpit e a validação das variáveis de ambiente na subida.

**O que não será testado em separado**

* Não há testes unitários por service ou repository: as duas costuras acima cobrem as regras. Testes unitários ficam restritos a funções puras, se surgirem (por exemplo, a validação do destino de retorno e a leitura da expiração do token), sem dublês de banco.
* O teste unitário do controller de exemplo sai junto com o controller.

**Prior art**

* O teste de ponta a ponta que veio no esqueleto da API, que sobe o módulo raiz e faz requisições com supertest sob o Vitest. A costura 1 amplia esse padrão.
* Não há prior art para a costura 2: o Playwright ainda não existe no projeto.

**Definição de pronto**

Cada etapa termina com todas as suítes de teste do projeto alterado, a compilação do TypeScript sem erros e o lint passando, tudo dentro dos contêineres. Na web, entra também o build de produção. As telas passam pela validação visual do design system.

## Out of Scope

* Troca de senha pelo Usuário já autenticado e o encerramento de todas as Sessões a pedido, que dependem de uma tela de conta.
* Lista de Sessões ativas, troca de e-mail e exclusão do próprio Usuário.
* Plano, cota e bytes usados: nem as colunas nem os campos na resposta do Usuário autenticado.
* A pasta raiz do Usuário, criada sob demanda pela funcionalidade de pastas.
* Login social e autenticação em dois fatores.
* Captcha no cadastro e checagem da senha contra listas de senhas vazadas.
* Limpeza de Usuários que nunca verificaram o e-mail.
* O texto definitivo dos Termos e da Política de Privacidade, que depende de validação jurídica.
* Desenho dos e-mails transacionais no Figma.
* O pacote de tipos compartilhados e o workspace na raiz do repositório.
* Os serviços de storage e de worker, e o envio de e-mail por fila.
* A escolha do provedor de e-mail de produção.

## Further Notes

* **Vocabulário:** o glossário do projeto fixa **Usuário** (a pessoa com e-mail, senha, plano e arquivos) e **Sessão** (o login de um Usuário em um navegador). "Conta" aparece só em textos de interface, como "Criar conta", e não nomeia nada no código.
* **Documentos de origem:** o low-level design do projeto traz o esquema completo, o contrato e as regras, já atualizados com estas decisões. Os critérios de aceite de cada etapa estão nas sub-issues desta issue.
* **Next.js:** a versão instalada tem mudanças em relação ao que é mais conhecido. Os guias que acompanham o pacote devem ser lidos antes de escrever código da web.
* **Antes de começar:** a branch principal só tem o primeiro commit. A branch do esqueleto do projeto precisa ser integrada por pull request, e a branch desta funcionalidade nasce da principal atualizada.
* **Para a fase 2:** a renovação por cookies é responsabilidade da web. Os apps nativos consomem as mesmas rotas e guardam os tokens por conta própria.
