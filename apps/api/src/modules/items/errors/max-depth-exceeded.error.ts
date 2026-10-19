import { DomainError } from '../../../common/errors/domain-error.js';
import { MAX_FOLDER_DEPTH } from '../entities/item.entity.js';

/** A pasta passaria do 50º nível de profundidade. */
export class MaxDepthExceededError extends DomainError {
  readonly code = 'max_depth_exceeded';

  constructor() {
    super(`As pastas podem ter no máximo ${MAX_FOLDER_DEPTH} níveis.`);
  }
}
