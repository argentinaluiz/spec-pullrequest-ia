import { DomainError } from '../../../common/errors/domain-error.js';

/** Item inexistente, de outro Usuário ou que a rota ainda não aceita. */
export class ItemNotFoundError extends DomainError {
  readonly code = 'not_found';

  constructor() {
    super('O item não existe.');
  }
}
