import { describe, expect, it } from "vitest";
import { createBrowserIncompleteStore, createIncompleteStore } from "@/lib/uploads/incomplete-store";

/** Um `Storage` do navegador, em memória. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

const record = (itemId: string) => ({
  itemId,
  fingerprint: { name: "a.bin", sizeBytes: 10, lastModified: 1 },
});

describe("armazenamento dos envios incompletos", () => {
  it("os incompletos de um Usuário não aparecem para outro no mesmo navegador", { tags: ["@LUI-171-CA4"] }, () => {
    const storage = memoryStorage();
    createIncompleteStore(storage, "user-a").save(record("item-a"));

    expect(createIncompleteStore(storage, "user-b").load()).toEqual([]);
    expect(createIncompleteStore(storage, "user-a").load()).toEqual([record("item-a")]);
  });

  it("troca o registro do mesmo item e remove o que saiu", () => {
    const store = createIncompleteStore(memoryStorage(), "user-a");
    store.save(record("item-1"));
    store.save({ ...record("item-1"), fingerprint: { name: "b", sizeBytes: 2, lastModified: 3 } });
    store.save(record("item-2"));
    store.remove("item-2");

    expect(store.load()).toEqual([
      { itemId: "item-1", fingerprint: { name: "b", sizeBytes: 2, lastModified: 3 } },
    ]);
  });

  it("ignora um conteúdo que não é o esperado", () => {
    const storage = memoryStorage();
    storage.setItem("uploads:incomplete:user-a", "{não é json");
    expect(createIncompleteStore(storage, "user-a").load()).toEqual([]);
    storage.setItem("uploads:incomplete:user-a", JSON.stringify([{ itemId: 1 }, record("ok")]));
    expect(createIncompleteStore(storage, "user-a").load()).toEqual([record("ok")]);
  });

  it("duas abas do mesmo Usuário não sobrescrevem os registros uma da outra", () => {
    const storage = memoryStorage();
    const first = createIncompleteStore(storage, "user-a");
    const second = createIncompleteStore(storage, "user-a");

    first.save(record("item-1"));
    second.save(record("item-2"));
    expect(first.load().map((r) => r.itemId)).toEqual(["item-1", "item-2"]);

    first.remove("item-1");
    expect(second.load().map((r) => r.itemId)).toEqual(["item-2"]);
  });

  it("sem acesso ao armazenamento do navegador, nada guarda e nada lança", () => {
    const store = createBrowserIncompleteStore("user-a", () => {
      throw new DOMException("bloqueado", "SecurityError");
    });

    expect(() => store.save(record("item-1"))).not.toThrow();
    expect(store.load()).toEqual([]);
  });
});
