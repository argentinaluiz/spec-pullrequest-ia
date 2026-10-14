import { DomainError } from '../../../common/errors/domain-error.js';

/** O espaço livre da Cota do Usuário não comporta o arquivo. */
export class QuotaExceededError extends DomainError {
  readonly code = 'quota_exceeded';

  constructor() {
    super('Não há espaço na cota para este arquivo.');
  }
}
