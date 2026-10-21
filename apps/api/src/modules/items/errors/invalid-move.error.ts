import { DomainError } from '../../../common/errors/domain-error.js';

/** Mover uma pasta para dentro dela mesma ou de uma descendente, ou mover a Pasta raiz. */
export class InvalidMoveError extends DomainError {
  readonly code = 'invalid_move';

  constructor() {
    super('Este item não pode ser movido para lá.');
  }
}
