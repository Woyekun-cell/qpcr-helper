import Dexie, { type EntityTable } from "dexie";

export interface GuestProject {
  id: string;
  name: string;
  updatedAt: number;
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
  put: (project: GuestProject) => database.projects.put(project),
  get: (id: string) => database.projects.get(id),
  list: () => database.projects.orderBy("updatedAt").reverse().toArray(),
  delete: (id: string) => database.projects.delete(id),
  clear: () => database.projects.clear()
};
