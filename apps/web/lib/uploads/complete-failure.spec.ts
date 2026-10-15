import { describe, expect, it } from "vitest";
import { completeFailureReason } from "@/lib/uploads/complete-failure";

describe("motivo da falha da conclusão", () => {
  it("descarta a sessão quando a API apagou o upload ou ele não existe mais", () => {
    expect(completeFailureReason("upload_size_mismatch")).toBe("discarded");
    expect(completeFailureReason("not_found")).toBe("discarded");
  });

  it("pede a consulta de progresso no upload_incomplete", () => {
    expect(completeFailureReason("upload_incomplete")).toBe("incomplete");
  });

  it("repete a conclusão na mesma sessão só no internal_error e no rate_limited", () => {
    expect(completeFailureReason("internal_error")).toBe("retryable");
    expect(completeFailureReason("rate_limited")).toBe("retryable");
  });

  it("encerra o envio sem nova tentativa em qualquer outro código", () => {
    expect(completeFailureReason("validation_error")).toBe("terminal");
    expect(completeFailureReason("file_too_large")).toBe("terminal");
    expect(completeFailureReason("quota_exceeded")).toBe("terminal");
  });
});
