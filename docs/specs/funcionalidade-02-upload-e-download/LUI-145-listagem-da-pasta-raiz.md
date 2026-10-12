# LUI-145 · Listagem da pasta raiz

> Cópia para conferência, tirada do Linear em 12/10/2026. A fonte é a issue [LUI-145](https://linear.app/argentinaluiz/issue/LUI-145/listagem-da-pasta-raiz) no Linear; esta cópia não é atualizada quando a issue muda.

| | |
| --- | --- |
| **Tipo** | Ticket |
| **Situação** | Backlog |
| **Labels** | `ready-for-agent`, `Feature` |
| **Spec** | [LUI-142](./LUI-142-spec.md) Funcionalidade 02: upload e download de arquivos |
| **Bloqueado por** | [LUI-144](./LUI-144-telas-de-arquivos-no-figma.md) Telas de arquivos no Figma |
| **Bloqueia** | [LUI-146](./LUI-146-enviar-um-arquivo.md) Enviar um arquivo |

---

## Parent

[LUI-142](./LUI-142-spec.md)

## What to build

Depois de entrar, o Usuário cai na listagem dos próprios arquivos, no lugar da página provisória. Como ainda não há upload, ele vê o estado vazio "Arraste arquivos para cá ou clique em Enviar". O e-mail dele e o botão "Sair" continuam na tela.

Regras que valem aqui:

* Nasce o módulo de itens, dono da tabela de itens, com o esquema da seção "Esquema do banco" do LLD. Dos índices, entram o de listagem de pasta, o de limpeza de pendentes e o de raiz única por Usuário. Os de lixeira e de busca ficam para as funcionalidades que os usam.
* A pasta raiz é criada sob demanda, na primeira vez que é necessária, uma por Usuário. Pedidos simultâneos não criam duas.
* Duas rotas, sob autenticação: a que devolve um item e a que lista os filhos ativos de uma pasta. O id `root` é atalho para a pasta raiz do Usuário.
* A listagem devolve só itens ativos, com pastas primeiro e depois por nome, paginada por cursor, com 50 itens por padrão e no máximo 200. Itens pendentes não aparecem.
* Toda consulta filtra pelo dono. Item inexistente e item de outro Usuário respondem igual, com `not_found`.
* A rota de um item devolve o item. A trilha de pastas até a raiz fica para a funcionalidade de pastas.
* O módulo de itens expõe um service público para os outros módulos, que não acessam a tabela.
* Na web, a página lê os dados pelo servidor, pela camada de acesso a dados que confere a Sessão.
* O botão "Enviar" e a ação "Baixar" não fazem parte deste ticket e não aparecem ainda. A listagem com arquivos, a ordenação e a paginação são conferidas no ticket de envio, quando passa a existir como criar um arquivo.
* Documentos atualizados na mesma tarefa: o glossário ganha "Item", "Arquivo" e "Pasta", e o LLD registra que a raiz nasce com esta funcionalidade e que a rota de um item ainda não devolve a trilha.

## Acceptance criteria

- [ ] Pedir o item `root` devolve a pasta raiz do Usuário, e pedir de novo devolve a mesma pasta (teste HTTP).
- [ ] Pedidos simultâneos pela raiz de um Usuário recém-criado devolvem todos o mesmo id (teste HTTP).
- [ ] Listar os filhos de `root` de um Usuário sem arquivos devolve uma lista vazia, sem `nextCursor` (teste HTTP).
- [ ] Pedir ou listar, pelo id, a raiz de outro Usuário responde `not_found`, igual a um id inexistente (teste HTTP).
- [ ] `limit` acima de 200 ou inválido responde `validation_error` (teste HTTP).
- [ ] As duas rotas respondem `unauthenticated` sem token (teste HTTP).
- [ ] No navegador, o Usuário entra e vê a listagem com o estado vazio, o próprio e-mail e o botão "Sair", que encerra a Sessão (teste no Playwright).
- [ ] Os testes no navegador da funcionalidade 01 que usavam a página provisória continuam passando (teste no Playwright).
- [ ] A tela bate com o Figma no claro e no escuro, no celular e no desktop, e a validação visual do design system foi feita.
- [ ] O glossário e o LLD refletem as decisões deste ticket.
- [ ] Todas as suítes de teste, a compilação do TypeScript e o lint passam na API e na web, e o build de produção da web passa, dentro dos contêineres.
