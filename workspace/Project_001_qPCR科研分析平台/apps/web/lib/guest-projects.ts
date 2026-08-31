import Dexie, { type EntityTable } from "dexie";
import { createClientId } from "./id";

export interface GuestProject {
  id: string;
  name: string;
  updatedAt: number;
  payload: unknown;
  versions?: GuestProjectVersion[];
}

export interface GuestProjectVersion {
  id: string;
  createdAt: number;
  payload: unknown;
}

class GuestProjectDatabase extends Dexie {
  projects!: EntityTable<GuestProject, "id">;

  constructor() {
    super("qpcr-research-platform");
    this.version(1).stores({ projects: "id, updatedAt" });
  }
}

const database = new GuestProjectDatabase();

export const guestProjects = {
  async put(project: GuestProject) {
    const existing = await database.projects.get(project.id);
    return database.projects.put({
      ...project,
      versions: project.versions ?? existing?.versions ?? []
    });
  },
  async appendVersion(version: { id: string; name: string; payload: unknown; createdAt?: number }) {
    return database.transaction("rw", database.projects, async () => {
      const existing = await database.projects.get(version.id);
      const createdAt = version.createdAt ?? Date.now();
      const versions = [
        ...(existing?.versions ?? []),
        { id: createClientId(), createdAt, payload: version.payload }
      ];
      await database.projects.put({
        id: version.id,
        name: version.name,
        updatedAt: createdAt,
        payload: version.payload,
        versions
      });
    });
  },
  get: (id: string) => database.projects.get(id),
  list: () => database.projects.orderBy("updatedAt").reverse().toArray(),
  delete: (id: string) => database.projects.delete(id),
  clear: () => database.projects.clear()
};
