import { describe, expect, it } from "vitest";
import { fingerprintOf, sameFile } from "@/lib/uploads/fingerprint";

const file = (name: string, size: number, lastModified: number) =>
  new File([new Uint8Array(size)], name, { lastModified });

describe("impressão do arquivo", () => {
  it("aceita o mesmo arquivo e recusa outro nome, tamanho ou data @LUI-171-CA3", () => {
    const original = fingerprintOf(file("relatorio.pdf", 10, 1_700_000_000_000));

    expect(sameFile(original, fingerprintOf(file("relatorio.pdf", 10, 1_700_000_000_000)))).toBe(
      true,
    );
    expect(sameFile(original, fingerprintOf(file("outro.pdf", 10, 1_700_000_000_000)))).toBe(false);
    expect(sameFile(original, fingerprintOf(file("relatorio.pdf", 11, 1_700_000_000_000)))).toBe(
      false,
    );
    expect(sameFile(original, fingerprintOf(file("relatorio.pdf", 10, 1_700_000_000_001)))).toBe(
      false,
    );
  });
});
