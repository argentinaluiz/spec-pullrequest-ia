import { describe, expect, it } from "vitest";
import { firstPageKey } from "@/lib/first-page-key";

describe("firstPageKey", () => {
  it("é a mesma para a mesma primeira página", () => {
    expect(firstPageKey(["a", "b"], "c1")).toBe(firstPageKey(["a", "b"], "c1"));
  });

  it("muda quando entra um Item antes dos outros", () => {
    expect(firstPageKey(["n", "a", "b"], "c2")).not.toBe(
      firstPageKey(["a", "b"], "c1"),
    );
  });

  it("muda quando só o cursor muda, inclusive de nulo para um valor", () => {
    expect(firstPageKey(["a"], null)).not.toBe(firstPageKey(["a"], "c1"));
  });

  it("não confunde ids de limites diferentes", () => {
    expect(firstPageKey(["a,b"], null)).not.toBe(firstPageKey(["a", "b"], null));
  });
});
