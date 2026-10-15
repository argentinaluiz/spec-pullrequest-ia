import type { Fingerprint } from "@/lib/uploads/fingerprint";

/** O que o navegador guarda de um envio incompleto: o id do upload e a impressão do arquivo. Nunca a `uploadUrl`. */
export interface IncompleteRecord {
  itemId: string;
  fingerprint: Fingerprint;
}

export interface IncompleteStore {
  /** O Usuário dono do armazenamento. */
  userId: string;
  load: () => IncompleteRecord[];
  save: (record: IncompleteRecord) => void;
  remove: (itemId: string) => void;
  /** Troca todos os registros de uma vez. */
  saveAll: (records: IncompleteRecord[]) => void;
}

const KEY_PREFIX = "uploads:incomplete:";

function isRecord(value: unknown): value is IncompleteRecord {
  if (typeof value !== "object" || value === null) return false;
  const { itemId, fingerprint } = value as Partial<IncompleteRecord>;
  if (typeof itemId !== "string" || typeof fingerprint !== "object" || fingerprint === null) {
    return false;
  }
  return (
    typeof fingerprint.name === "string" &&
    typeof fingerprint.sizeBytes === "number" &&
    typeof fingerprint.lastModified === "number"
  );
}

/**
 * Os incompletos de um Usuário num `Storage` recebido (docs/lld.md, seção 7.4), numa chave com o id
 * dele: outra conta no mesmo navegador não os vê. Cada consulta e cada escrita relê o `Storage`,
 * para que duas abas do mesmo Usuário não sobrescrevam os registros uma da outra. Um armazenamento
 * que falha ou traz outro conteúdo é tratado como vazio.
 */
export function createIncompleteStore(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  userId: string,
): IncompleteStore {
  const key = `${KEY_PREFIX}${userId}`;

  function read(): IncompleteRecord[] {
    try {
      const parsed: unknown = JSON.parse(storage.getItem(key) ?? "[]");
      return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
    } catch {
      return [];
    }
  }

  function saveAll(next: IncompleteRecord[]) {
    try {
      if (next.length === 0) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(next));
    } catch {
      // Sem armazenamento (cheio ou bloqueado), o envio só não volta depois de fechar a aba.
    }
  }

  return {
    userId,
    load: read,
    save: (record) =>
      saveAll([...read().filter((other) => other.itemId !== record.itemId), record]),
    remove: (itemId) => {
      const current = read();
      if (current.some((other) => other.itemId === itemId)) {
        saveAll(current.filter((other) => other.itemId !== itemId));
      }
    },
    saveAll,
  };
}

/** Um `Storage` que não guarda nada, para o navegador que bloqueia o armazenamento do site. */
const NO_STORAGE: Pick<Storage, "getItem" | "setItem" | "removeItem"> = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

/**
 * Os incompletos no `localStorage` do navegador. Com o armazenamento bloqueado, até ler a
 * propriedade lança: o recurso degrada, sem incompletos guardados, e nada quebra.
 */
export function createBrowserIncompleteStore(
  userId: string,
  getStorage: () => Storage = () => window.localStorage,
): IncompleteStore {
  let storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  try {
    storage = getStorage();
  } catch {
    storage = NO_STORAGE;
  }
  return createIncompleteStore(storage, userId);
}
