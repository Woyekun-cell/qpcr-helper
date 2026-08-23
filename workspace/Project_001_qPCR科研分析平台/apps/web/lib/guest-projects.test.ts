import { afterEach, describe, expect, it } from "vitest";
import { guestProjects } from "./guest-projects";

afterEach(async () => guestProjects.clear());

describe("guest project persistence", () => {
  it("round-trips a project through IndexedDB", async () => {
    await guestProjects.put({ id: "p1", name: "Pilot", updatedAt: 1, payload: { wells: 12 } });
    await expect(guestProjects.get("p1")).resolves.toMatchObject({ name: "Pilot" });
  });

  it("appends immutable analysis versions instead of overwriting prior results", async () => {
    await guestProjects.appendVersion({
      id: "p1",
      name: "Pilot",
      payload: { confidenceLevel: 0.95, fold: 8 },
      createdAt: 10
    });
    await guestProjects.appendVersion({
      id: "p1",
      name: "Pilot",
      payload: { confidenceLevel: 0.90, fold: 8 },
      createdAt: 20
    });
    const project = await guestProjects.get("p1");
    expect(project?.versions).toHaveLength(2);
    expect(project?.versions?.map((version) => version.payload)).toEqual([
      { confidenceLevel: 0.95, fold: 8 },
      { confidenceLevel: 0.90, fold: 8 }
    ]);
  });
});
