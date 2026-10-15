/** Erro de um campo da entrada, no corpo de `validation_error`. */
export class FieldErrorDto {
  /** Caminho do campo na entrada, com pontos nos aninhados. */
  field: string;
  messages: string[];
}

/** Corpo de erro da API: RFC 9457, mais o `code` estável do contrato (seção 3.1 do docs/lld.md). */
export class ProblemDetailsDto {
  type: 'about:blank';
  title: string;
  status: number;
  /** Código estável do erro, como `invalid_token`. */
  code: string;
  detail?: string;
  /** Só em `validation_error`. */
  errors?: FieldErrorDto[];
}
