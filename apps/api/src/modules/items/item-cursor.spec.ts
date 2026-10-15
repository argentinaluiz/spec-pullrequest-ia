import { InputValidationError } from '../../common/errors/input-validation.error.js';
import { decodeItemCursor, encodeItemCursor } from './item-cursor.js';

describe('cursor da listagem de uma pasta', () => {
  it('devolve a posição que foi codificada, com acentos e espaços no nome', () => {
    const position = {
      type: 'file' as const,
      name: 'relatório final, versão 2.pdf',
      id: '0199e2a4-7c1b-7d2e-9f3a-4b5c6d7e8f90',
    };

    const decoded = decodeItemCursor(encodeItemCursor(position));

    expect(decoded).toEqual(position);
  });

  it('gera um texto que vai na URL sem precisar de escape', () => {
    const cursor = encodeItemCursor({
      type: 'folder',
      name: 'a/b?c=d&e',
      id: '0199e2a4-7c1b-7d2e-9f3a-4b5c6d7e8f90',
    });

    expect(cursor).toMatch(/^[\w-]+$/);
  });

  it.each([
    ['um texto que não é base64url', '***'],
    [
      'um JSON que não é a posição',
      Buffer.from('{"a":1}').toString('base64url'),
    ],
    [
      'um tipo desconhecido',
      Buffer.from(
        JSON.stringify(['link', 'a', '0199e2a4-7c1b-7d2e-9f3a-4b5c6d7e8f90']),
      ).toString('base64url'),
    ],
    [
      'um id que não é UUID',
      Buffer.from(JSON.stringify(['file', 'a', 'abc'])).toString('base64url'),
    ],
    ['um texto vazio', ''],
  ])('recusa %s com validation_error no campo cursor', (_case, cursor) => {
    const decode = () => decodeItemCursor(cursor);

    expect(decode).toThrow(InputValidationError);
    try {
      decode();
    } catch (error) {
      expect((error as InputValidationError).fieldErrors).toEqual([
        { field: 'cursor', messages: [expect.any(String)] },
      ]);
    }
  });
});
