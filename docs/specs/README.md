# Specs e tickets

Cópia das specs e dos tickets do projeto, tirada do Linear em 12/10/2026.

**Esta pasta existe só para conferência.** Tudo é gerenciado no Linear: é lá que as specs e os tickets são escritos, alterados, priorizados e concluídos. O que está aqui é um retrato de um momento, para quem lê o repositório sem acesso ao Linear. Ele não é atualizado quando uma issue muda, e os agentes de código não o usam: eles leem as issues direto no Linear.

Cada funcionalidade tem uma spec, e a spec é quebrada em tickets. A coluna "Bloqueado por" reproduz as dependências registradas no Linear e dá a ordem de execução.

## Funcionalidade 01: cadastro e login com e-mail e senha

Spec: [LUI-133](funcionalidade-01-cadastro-e-login/LUI-133-spec.md) · situação no Linear: Backlog

| Ticket | Título | Situação | Bloqueado por |
| --- | --- | --- | --- |
| [LUI-134](funcionalidade-01-cadastro-e-login/LUI-134-telas-de-autenticacao-no-figma.md) | Telas de autenticação no Figma | Done | — |
| [LUI-135](funcionalidade-01-cadastro-e-login/LUI-135-fundacao-ambiente-banco-e-mail-e-formato-de-erro.md) | Fundação: ambiente, banco, e-mail e formato de erro | Done | — |
| [LUI-136](funcionalidade-01-cadastro-e-login/LUI-136-base-da-web-componentes-de-autenticacao-e-testes-no-navegador.md) | Base da web: componentes de autenticação e testes no navegador | Done | LUI-134 |
| [LUI-137](funcionalidade-01-cadastro-e-login/LUI-137-cadastro-e-verificacao-de-e-mail.md) | Cadastro e verificação de e-mail | Done | LUI-135, LUI-136 |
| [LUI-138](funcionalidade-01-cadastro-e-login/LUI-138-entrar-e-sair.md) | Entrar e sair | Done | LUI-137 |
| [LUI-139](funcionalidade-01-cadastro-e-login/LUI-139-sessao-que-se-renova.md) | Sessão que se renova | Done | LUI-138 |
| [LUI-140](funcionalidade-01-cadastro-e-login/LUI-140-recuperacao-de-senha.md) | Recuperação de senha | Done | LUI-139 |
| [LUI-141](funcionalidade-01-cadastro-e-login/LUI-141-limite-de-tentativas-e-ip-real.md) | Limite de tentativas e IP real | Done | LUI-137, LUI-138, LUI-140 |

## Funcionalidade 02: upload e download de arquivos

Spec: [LUI-142](funcionalidade-02-upload-e-download/LUI-142-spec.md) · situação no Linear: Backlog

| Ticket | Título | Situação | Bloqueado por |
| --- | --- | --- | --- |
| [LUI-143](funcionalidade-02-upload-e-download/LUI-143-validacao-do-storage-local.md) | Validação do storage local | Backlog | — |
| [LUI-144](funcionalidade-02-upload-e-download/LUI-144-telas-de-arquivos-no-figma.md) | Telas de arquivos no Figma | Backlog | — |
| [LUI-145](funcionalidade-02-upload-e-download/LUI-145-listagem-da-pasta-raiz.md) | Listagem da pasta raiz | Backlog | LUI-144 |
| [LUI-146](funcionalidade-02-upload-e-download/LUI-146-enviar-um-arquivo.md) | Enviar um arquivo | Backlog | LUI-143, LUI-145 |
| [LUI-147](funcionalidade-02-upload-e-download/LUI-147-arrastar-varios-arquivos-e-cancelar.md) | Arrastar, vários arquivos e cancelar | Backlog | LUI-146 |
| [LUI-148](funcionalidade-02-upload-e-download/LUI-148-baixar-um-arquivo.md) | Baixar um arquivo | Backlog | LUI-146 |
| [LUI-149](funcionalidade-02-upload-e-download/LUI-149-limpeza-de-uploads-pendentes.md) | Limpeza de uploads pendentes | Backlog | LUI-146 |
| [LUI-150](funcionalidade-02-upload-e-download/LUI-150-retomada-de-envios.md) | Retomada de envios | Backlog | LUI-146, LUI-147 |
