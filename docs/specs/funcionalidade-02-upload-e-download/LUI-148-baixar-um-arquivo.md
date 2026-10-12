# LUI-148 · Baixar um arquivo

> Cópia para conferência, tirada do Linear em 12/10/2026. A fonte é a issue [LUI-148](https://linear.app/argentinaluiz/issue/LUI-148/baixar-um-arquivo) no Linear; esta cópia não é atualizada quando a issue muda.

| | |
| --- | --- |
| **Tipo** | Ticket |
| **Situação** | Backlog |
| **Labels** | `ready-for-agent`, `Feature` |
| **Spec** | [LUI-142](./LUI-142-spec.md) Funcionalidade 02: upload e download de arquivos |
| **Bloqueado por** | [LUI-146](./LUI-146-enviar-um-arquivo.md) Enviar um arquivo |
| **Bloqueia** | — |

---

## Parent

[LUI-142](./LUI-142-spec.md)

## What to build

O Usuário escolhe "Baixar" na linha de um arquivo e o navegador o salva com o nome original. O conteúdo vem direto do storage, por uma URL assinada que vale por pouco tempo.

Regras que valem aqui:

* A rota de URL de download pertence ao módulo de uploads. Ela confere o dono e devolve uma URL assinada de leitura e a validade dela.
* A URL vale por 5 minutos, o valor da seção "Configuração e segurança" do LLD.
* A disposição aceita `attachment` e `inline`, com `attachment` como padrão. A disposição e o nome do arquivo são fixados pela API na assinatura. A web usa só `attachment`; `inline` fica para a pré-visualização.
* Nomes com acentos, espaços e aspas chegam ao navegador como foram enviados.
* Só arquivos ativos têm URL de download. Item pendente, pasta, item inexistente e item de outro Usuário respondem `not_found`.
* O download não depende da cota: um Usuário acima do limite continua baixando.
* Na web, o pedido da URL passa pelo servidor da web, e o navegador é levado à URL assinada. A URL não é guardada nem reaproveitada entre cliques.
* Cada linha da listagem ganha o botão "Mais ações", que abre o menu com "Baixar".

## Acceptance criteria

- [ ] Pedir a URL de download de um arquivo ativo devolve a URL e a validade, e a URL entrega exatamente os bytes enviados (teste HTTP).
- [ ] Com `attachment`, a resposta do storage manda salvar com o nome original do arquivo, inclusive com acentos e espaços (teste HTTP).
- [ ] Com `inline`, a resposta do storage manda exibir, e um valor diferente dos dois responde `validation_error` (teste HTTP).
- [ ] A validade devolvida é de 5 minutos a partir do pedido (teste HTTP).
- [ ] Pedir a URL de um upload pendente, da pasta raiz, de um id inexistente ou de um arquivo de outro Usuário responde `not_found` (teste HTTP).
- [ ] A rota responde `unauthenticated` sem token (teste HTTP).
- [ ] No navegador, o Usuário envia um arquivo, escolhe "Baixar" na linha e recebe um arquivo com o mesmo nome e o mesmo conteúdo (teste no Playwright).
- [ ] A tela bate com o Figma no claro e no escuro, no celular e no desktop, e a validação visual do design system foi feita.
- [ ] Todas as suítes de teste, a compilação do TypeScript e o lint passam na API e na web, e o build de produção da web passa, dentro dos contêineres.
