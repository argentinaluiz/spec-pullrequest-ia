import type { TokenPair } from '../sessions.service.js';

/** Par de tokens devolvido pelo login e pela renovação. `implements` faz o compilador acusar se o service mudar o tipo e o contrato não. */
export class TokenPairDto implements TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Validade do token de acesso, em segundos. */
  expiresIn: number;
}
