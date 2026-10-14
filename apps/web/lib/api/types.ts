import "server-only";

/*
 * Tipos do contrato da API (docs/lld.md, seção 3). Enquanto não existe o pacote
 * compartilhado, a web mantém a própria cópia.
 */

/** Os `code` de erro que a autenticação usa, mais os dois que qualquer rota pode devolver. */
export const API_ERROR_CODES = [
  "validation_error",
  "invalid_token",
  "unauthenticated",
  "invalid_credentials",
  "email_not_verified",
  "rate_limited",
  "not_found",
  "internal_error",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Um campo recusado num `validation_error`. As mensagens são da API, para quem desenvolve. */
export interface ApiFieldError {
  field: string;
  messages: string[];
}

export interface ApiError {
  code: ApiErrorCode;
  status: number;
  /** Só em `validation_error` de um corpo que não passou na validação. */
  fieldErrors: ApiFieldError[];
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

export interface RegisterInput {
  email: string;
  password: string;
}

export interface VerifyEmailInput {
  token: string;
}

export interface ResendVerificationInput {
  email: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RefreshInput {
  refreshToken: string;
}

export interface LogoutInput {
  refreshToken: string;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Validade do token de acesso, em segundos. */
  expiresIn: number;
}

export interface Me {
  id: string;
  email: string;
}

export type ItemType = "file" | "folder";

/** Um Item da listagem de uma pasta. A forma é a do `ItemDto` do snapshot da OpenAPI. */
export interface Item {
  id: string;
  type: ItemType;
  name: string;
  /** 0 para pastas. */
  sizeBytes: number;
  /** Nulo para pastas. */
  mimeType: string | null;
  /** Data de modificação, em ISO 8601. */
  updatedAt: string;
}

/** Uma página da listagem. O cursor é opaco, e nulo na última página. */
export interface ItemPage {
  items: Item[];
  nextCursor: string | null;
}
