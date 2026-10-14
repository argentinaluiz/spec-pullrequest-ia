import { describe, expect, it } from "vitest";
import { loginPath } from "@/lib/session/login-path";

describe("loginPath", () => {
  it("sem opções, leva à tela de entrar sem parâmetros", () => {
    expect(loginPath()).toBe("/entrar");
  });

  it("leva o aviso e a página para onde voltar, codificados", () => {
    expect(
      loginPath({ notice: "sessao-expirada", returnTo: "/pasta?a=1" }),
    ).toBe("/entrar?aviso=sessao-expirada&destino=%2Fpasta%3Fa%3D1");
  });
});
