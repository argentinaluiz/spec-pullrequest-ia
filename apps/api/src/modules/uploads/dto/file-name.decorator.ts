import { applyDecorators } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';

/**
 * Um nome de arquivo na entrada, sem `/` nem caracteres de controle. O tamanho (1 a 255) fica
 * no DTO, onde o plugin do Swagger o lê para o contrato.
 */
export function IsFileName(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    Matches(/^[^/\p{Cc}]*$/u, {
      message: 'name não pode ter "/" nem caracteres de controle',
    }),
  );
}
