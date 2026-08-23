import { afterEach, describe, expect, it } from "vitest";
import { guestProjects } from "./guest-projects";

afterEach(async () => guestProjects.clear());

describe("guest project persistence", () => {
  it("round-trips a project through IndexedDB", async () => {
    await guestProjects.put({ id: "p1", name: "Pilot", updatedAt: 1, payload: { wells: 12 } });
    await expect(guestProjects.get("p1")).resolves.toMatchObject({ name: "Pilot" });
  });
});
