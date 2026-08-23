import { describe, expect, it } from "vitest";
import { GuestJobStore } from "./guest-jobs";

describe("GuestJobStore", () => {
  it("requires the exact capability token", async () => {
    const store = new GuestJobStore(60_000);
    const created = await store.create({ result: { foldChange: 8 }, inputHash: "a".repeat(64) });
    expect(await store.read(created.id, "wrong")).toBeNull();
    expect((await store.read(created.id, created.token))?.result).toEqual({ foldChange: 8 });
    expect(await store.read(created.id, created.token)).not.toHaveProperty("input");
  });

  it("expires and deletes derived guest job data", async () => {
    let now = 1000;
    const store = new GuestJobStore(60_000, () => now);
    const created = await store.create({ result: {}, inputHash: "b".repeat(64) });
    now += 60_001;
    expect(await store.read(created.id, created.token)).toBeNull();
    expect(store.size).toBe(0);
  });
});
