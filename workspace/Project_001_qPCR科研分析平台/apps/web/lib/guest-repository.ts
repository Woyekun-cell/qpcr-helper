import { createHash, randomBytes, randomUUID } from "node:crypto";
import { guestJobStore, type GuestJob, type GuestJobPayload } from "./guest-jobs";
import { createSupabaseAdminClient } from "./supabase/admin";

const GUEST_TTL_MS = 60 * 60 * 1000;

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const guestJobRepository = {
  async create(payload: GuestJobPayload) {
    const admin = createSupabaseAdminClient();
    if (!admin) return guestJobStore.create(payload);
    const id = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + GUEST_TTL_MS;
    await admin.from("guest_analysis_jobs").delete().lt("expires_at", new Date().toISOString());
    const { error } = await admin.from("guest_analysis_jobs").insert({
      id,
      token_hash: tokenHash(token),
      status: "succeeded",
      input_hash: payload.inputHash,
      result: payload.result,
      expires_at: new Date(expiresAt).toISOString()
    });
    if (error) throw new Error("Could not persist transient guest analysis");
    return { id, token, expiresAt };
  },

  async read(id: string, token: string): Promise<GuestJob | null> {
    const admin = createSupabaseAdminClient();
    if (!admin) return guestJobStore.read(id, token);
    if (!token) return null;
    const { data } = await admin
      .from("guest_analysis_jobs")
      .select("id, status, input_hash, result, created_at, expires_at")
      .eq("id", id)
      .eq("token_hash", tokenHash(token))
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!data) return null;
    return {
      id: data.id,
      status: "succeeded",
      inputHash: data.input_hash,
      result: data.result,
      createdAt: new Date(data.created_at).getTime(),
      expiresAt: new Date(data.expires_at).getTime()
    };
  },

  async delete(id: string, token: string): Promise<boolean> {
    const admin = createSupabaseAdminClient();
    if (!admin) return guestJobStore.delete(id, token);
    const job = await this.read(id, token);
    if (!job) return false;
    const { error } = await admin.from("guest_analysis_jobs").delete().eq("id", id);
    return !error;
  }
};
