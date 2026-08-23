import { describe, expect, it } from "vitest";
import { guestJobRepository } from "./guest-repository";

describe("guest job repository", () => {
  it("uses the capability-protected local fallback without Supabase credentials", async () => {
    const created = await guestJobRepository.create({ input: { ct: 25 }, result: { fold: 8 } });
    expect(await guestJobRepository.read(created.id, "invalid")).toBeNull();
    expect((await guestJobRepository.read(created.id, created.token))?.result).toEqual({ fold: 8 });
    expect(await guestJobRepository.delete(created.id, created.token)).toBe(true);
  });
});
