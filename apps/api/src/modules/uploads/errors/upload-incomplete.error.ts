import { DomainError } from '../../../common/errors/domain-error.js';

/** A conclusão foi pedida antes de o objeto chegar inteiro ao storage. */
export class UploadIncompleteError extends DomainError {
  readonly code = 'upload_incomplete';

  constructor() {
    super('O arquivo ainda não chegou inteiro ao armazenamento.');
  }
}
