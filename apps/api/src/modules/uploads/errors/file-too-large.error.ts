import { DomainError } from '../../../common/errors/domain-error.js';

/** O arquivo passa do tamanho máximo aceito, de 5 GB. */
export class FileTooLargeError extends DomainError {
  readonly code = 'file_too_large';

  constructor() {
    super('O arquivo passa do tamanho máximo de 5 GB.');
  }
}
