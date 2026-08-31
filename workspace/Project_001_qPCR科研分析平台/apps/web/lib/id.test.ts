import { describe, expect, it, vi } from "vitest";
import { createClientId } from "./id";

describe("createClientId", () => {
  it("uses the browser UUID when available", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "browser-uuid" });
    expect(createClientId()).toBe("browser-uuid");
    vi.unstubAllGlobals();
  });

  it("falls back to an RFC 4122 UUID when Web Crypto is unavailable", () => {
    vi.stubGlobal("crypto", undefined);
    expect(createClientId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    vi.unstubAllGlobals();
  });
});
