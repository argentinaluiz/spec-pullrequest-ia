import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ProblemDetailsDto } from './problem-details.dto.js';

/**
 * Documenta uma resposta de erro da rota: o status e os códigos de erro que ela pode devolver,
 * no corpo `application/problem+json` (seção 3.1 do docs/lld.md). Os códigos vão no `enum` do
 * campo `code`, e não só na descrição, para a verificação do contrato enxergá-los.
 */
export function ApiProblem(status: number, ...codes: string[]) {
  return applyDecorators(
    ApiExtraModels(ProblemDetailsDto),
    ApiResponse({
      status,
      description: codes.join(', '),
      content: {
        'application/problem+json': {
          schema: {
            allOf: [{ $ref: getSchemaPath(ProblemDetailsDto) }],
            properties: { code: { type: 'string', enum: codes } },
          },
        },
      },
    }),
  );
}
