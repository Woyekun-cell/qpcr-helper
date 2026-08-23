import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export interface GuestJobPayload {
  input: unknown;
  result: unknown;
}

export interface GuestJob extends GuestJobPayload {
  id: string;
  status: "succeeded";
  createdAt: number;
  expiresAt: number;
}

interface StoredGuestJob extends GuestJob {
  tokenHash: Buffer;
}

function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

export class GuestJobStore {
  private readonly jobs = new Map<string, StoredGuestJob>();

  constructor(
    private readonly ttlMs = 60 * 60 * 1000,
    private readonly now: () => number = Date.now
  ) {}

  get size(): number {
    return this.jobs.size;
  }

  async create(payload: GuestJobPayload): Promise<{ id: string; token: string; expiresAt: number }> {
    this.cleanup();
    const id = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const createdAt = this.now();
    const expiresAt = createdAt + this.ttlMs;
    this.jobs.set(id, {
      ...payload,
      id,
      status: "succeeded",
      createdAt,
      expiresAt,
      tokenHash: hashToken(token)
    });
    return { id, token, expiresAt };
  }

  async read(id: string, token: string): Promise<GuestJob | null> {
    this.cleanup();
    const job = this.jobs.get(id);
    if (!job || !token) return null;
    const candidate = hashToken(token);
    if (!timingSafeEqual(job.tokenHash, candidate)) return null;
    return {
      id: job.id,
      status: job.status,
      createdAt: job.createdAt,
      expiresAt: job.expiresAt,
      input: job.input,
      result: job.result
    };
  }

  async delete(id: string, token: string): Promise<boolean> {
    const job = await this.read(id, token);
    if (!job) return false;
    return this.jobs.delete(id);
  }

  cleanup(): void {
    const now = this.now();
    for (const [id, job] of this.jobs) {
      if (job.expiresAt <= now) this.jobs.delete(id);
    }
  }
}

declare global {
  var __qpcrGuestJobStore: GuestJobStore | undefined;
}

export const guestJobStore = globalThis.__qpcrGuestJobStore ?? new GuestJobStore();
if (process.env.NODE_ENV !== "production") globalThis.__qpcrGuestJobStore = guestJobStore;
