import { describe, expect, it } from "vitest";
import { GuestJobStore } from "./guest-jobs";

describe("GuestJobStore", () => {
  it("requires the exact capability token", async () => {
    const store = new GuestJobStore(60_000);
    const created = await store.create({ result: { foldChange: 8 }, input: { secret: "ct" } });
    expect(await store.read(created.id, "wrong")).toBeNull();
    expect((await store.read(created.id, created.token))?.result).toEqual({ foldChange: 8 });
  });

  it("expires and deletes raw guest data", async () => {
    let now = 1000;
    const store = new GuestJobStore(60_000, () => now);
    const created = await store.create({ result: {}, input: { ct: 25 } });
    now += 60_001;
    expect(await store.read(created.id, created.token)).toBeNull();
    expect(store.size).toBe(0);
  });
});
