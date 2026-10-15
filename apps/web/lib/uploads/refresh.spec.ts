import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRefreshBatcher } from "@/lib/uploads/refresh";

describe("revalidação depois das conclusões", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("as conclusões dentro de meio segundo dividem uma revalidação, e a que chega depois dela ganha outra", () => {
    const refresh = vi.fn();
    const batcher = createRefreshBatcher(refresh, 500);

    batcher.request();
    vi.advanceTimersByTime(200);
    batcher.request();
    vi.advanceTimersByTime(300);
    const afterFirst = refresh.mock.calls.length;
    batcher.request();
    vi.advanceTimersByTime(500);

    expect(afterFirst).toBe(1);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("descartado, não revalida o que estava esperando", () => {
    const refresh = vi.fn();
    const batcher = createRefreshBatcher(refresh, 500);
    batcher.request();

    batcher.dispose();
    vi.advanceTimersByTime(1000);

    expect(refresh).not.toHaveBeenCalled();
  });
});
