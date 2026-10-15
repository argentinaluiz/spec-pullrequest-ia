# Gerenciador de Arquivos

Armazenamento de arquivos na nuvem para pessoas físicas, com um plano gratuito e planos pagos de espaço adicional.

## Language

**Usuário**:
A pessoa que tem um e-mail, uma senha, um plano e os próprios arquivos.
_Avoid_: Conta, cliente, membro

**Sessão**:
O login de um Usuário em um navegador, que dura até ele sair, expirar ou ser revogado.
_Avoid_: Token de renovação, dispositivo, login ativo

**Item**:
Um arquivo ou uma pasta de um Usuário. O conteúdo de um arquivo fica no storage, num objeto com chave aleatória.
_Avoid_: Nó, entrada, documento

**Pasta raiz**:
A pasta de topo de cada Usuário, mostrada como "Meus arquivos". Não aparece em listas e não pode ser renomeada, movida nem excluída.
_Avoid_: Home, diretório principal

**Cota**:
O espaço que o plano do Usuário dá e os bytes que ele já usa, contando a lixeira e os uploads em andamento.
_Avoid_: Armazenamento, limite, espaço livre
