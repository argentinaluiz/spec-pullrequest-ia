import { InputValidationError } from '../../common/errors/input-validation.error.js';
import { ItemPosition } from './entities/item.entity.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O cursor opaco da listagem: a posição do último Item da página, em JSON e
 * base64url, para ir na URL sem escape. O cliente só o devolve como recebeu.
 */
export function encodeItemCursor(position: ItemPosition): string {
  return Buffer.from(
    JSON.stringify([position.type, position.name, position.id]),
  ).toString('base64url');
}

/** A posição guardada no cursor. Um cursor ilegível é entrada inválida. */
export function decodeItemCursor(cursor: string): ItemPosition {
  const position = parse(cursor);
  if (!position) {
    throw new InputValidationError([
      { field: 'cursor', messages: ['cursor inválido'] },
    ]);
  }
  return position;
}

function parse(cursor: string): ItemPosition | null {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!Array.isArray(value) || value.length !== 3) {
    return null;
  }
  const [type, name, id] = value as unknown[];
  if (
    (type !== 'file' && type !== 'folder') ||
    typeof name !== 'string' ||
    typeof id !== 'string' ||
    !UUID.test(id)
  ) {
    return null;
  }
  return { type, name, id };
}
