import { describe, expect, it } from "vitest";
import { panelTitle } from "@/lib/uploads/panel";
import type { UploadEntry, UploadStatus } from "@/lib/uploads/types";

const entries = (...statuses: UploadStatus[]): UploadEntry[] =>
  statuses.map((status, index) => ({
    key: String(index),
    name: `arquivo-${index}.bin`,
    mimeType: "application/octet-stream",
    sizeBytes: 10,
    status,
    progress: 0,
  }));

describe("título do painel de envios", () => {
  it("conta o pausado entre os que estão enviando, como no Figma", () => {
    expect(panelTitle(entries("uploading", "paused", "done"))).toBe("Enviando 2 de 3");
  });

  it("com só pausados por terminar, continua no resumo do envio", () => {
    expect(panelTitle(entries("paused", "done"))).toBe("Enviando 1 de 2");
  });

  it("com tudo terminado, conta os concluídos", () => {
    expect(panelTitle(entries("done", "failed"))).toBe("1 de 2 enviado");
  });
});
