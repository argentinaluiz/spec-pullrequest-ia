# LUI-149 · Limpeza de uploads pendentes

> Cópia para conferência, tirada do Linear em 12/10/2026. A fonte é a issue [LUI-149](https://linear.app/argentinaluiz/issue/LUI-149/limpeza-de-uploads-pendentes) no Linear; esta cópia não é atualizada quando a issue muda.

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

Um upload que o Usuário abandonou deixa de prender espaço. Depois de 24 horas pendente, a limpeza remove o item, apaga o que chegou ao storage e devolve o espaço reservado, e o Usuário volta a poder usar esses bytes. Este ticket não tem interface.

Regras que valem aqui:

* **Worker:** nasce o serviço de worker, que é a mesma imagem da API num serviço próprio do Compose, como define a seção "Tarefas do worker" do LLD. Ele expõe um endpoint interno para a limpeza de pendentes.
* **Acesso:** no ambiente local, o endpoint do worker não é publicado na máquina, e a API pública não expõe a rota de limpeza. A autenticação das chamadas por OIDC entra com o staging.
* **Disparo:** no ambiente local, um comando dispara a limpeza, como prevê o HLD para as rotinas agendadas. Em produção, ela roda a cada hora.
* **Prazo:** o prazo de upload pendente é lido de variável de ambiente, com padrão de 24 horas, e pode ser reduzido para testar. A variável e o endereço do worker entram no arquivo de exemplo e na validação da subida.
* **O que é limpo:** itens pendentes criados há mais tempo que o prazo. Pendentes dentro do prazo e itens ativos não são tocados.
* **Ordem:** primeiro o objeto é apagado do storage, e só depois o item sai do banco e o espaço volta. Na ordem inversa, uma falha no meio deixaria um objeto órfão.
* **Idempotência:** rodar a limpeza duas vezes dá o mesmo resultado. Um upload sem nenhum byte enviado, ou cujo objeto já não existe, é limpo sem erro.
* **Falha parcial:** se um item falhar, os outros são limpos, a falha vai para o log e o item é tentado de novo na execução seguinte.
* **Corrida com a conclusão:** um upload concluído no mesmo instante da limpeza termina ativo ou removido, nunca ativo sem objeto nem com o espaço devolvido duas vezes.
* A lógica da limpeza fica no módulo de uploads. A fila de tarefas, as novas tentativas de tarefa e a reconciliação dos bytes usados não fazem parte deste ticket.
* Documentos atualizados na mesma tarefa: o HLD (o Compose passa a ter o `worker`), o LLD (as variáveis novas no schema de validação) e o guia de agentes da raiz (a tabela de serviços e o comando da limpeza).

## Acceptance criteria

- [ ] Com o prazo reduzido, um upload pendente vencido some depois da limpeza: concluir responde `not_found`, e o espaço volta a aceitar um upload que antes não caberia (teste HTTP).
- [ ] O objeto parcial de um upload limpo não está mais no storage (teste HTTP).
- [ ] Um upload pendente dentro do prazo continua podendo ser concluído depois da limpeza (teste HTTP).
- [ ] Um arquivo ativo não é tocado pela limpeza (teste HTTP).
- [ ] Rodar a limpeza duas vezes seguidas não é erro e não devolve espaço em dobro (teste HTTP).
- [ ] Um upload vencido sem nenhum byte enviado é limpo sem erro (teste HTTP).
- [ ] A rota de limpeza não existe na API pública: responde `not_found` (teste HTTP).
- [ ] O ambiente sobe do zero com o serviço de worker pronto, sem passo manual, e o comando de disparo executa a limpeza.
- [ ] A API e o worker não sobem com o prazo inválido (teste de integração da validação da subida).
- [ ] O HLD, o LLD e o guia de agentes da raiz refletem o serviço novo, as variáveis e o comando.
- [ ] Todas as suítes de teste, a compilação do TypeScript e o lint passam na API, dentro do contêiner.
