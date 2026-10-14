import { DomainError } from '../../../common/errors/domain-error.js';

/** O objeto que chegou ao storage tem tamanho diferente do declarado. */
export class UploadSizeMismatchError extends DomainError {
  readonly code = 'upload_size_mismatch';

  constructor() {
    super('O tamanho do arquivo enviado é diferente do declarado.');
  }
}
