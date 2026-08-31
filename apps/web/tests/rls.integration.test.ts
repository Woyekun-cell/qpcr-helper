import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.SUPABASE_TEST_URL;
const anon = process.env.SUPABASE_TEST_ANON_KEY;
const service = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const ready = Boolean(url && anon && service);

describe.skipIf(!ready)("Supabase cross-account RLS", () => {
  let admin: SupabaseClient;
  let first: SupabaseClient;
  let second: SupabaseClient;
  let firstUser: User;
  let secondUser: User;
  const password = `Qpcr-${crypto.randomUUID()}-Aa1!`;
  const projectId = crypto.randomUUID();
  const secondProjectId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  let storagePath = "";

  beforeAll(async () => {
    admin = createClient(url!, service!, { auth: { persistSession: false } });
    const createUser = async (suffix: string) => {
      const email = `qpcr-rls-${suffix}-${crypto.randomUUID()}@example.test`;
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) throw error ?? new Error("Could not create RLS test user");
      return { email, user: data.user };
    };
    const one = await createUser("one");
    const two = await createUser("two");
    firstUser = one.user;
    secondUser = two.user;
    storagePath = `${firstUser.id}/${jobId}/rls-fixture.txt`;
    first = createClient(url!, anon!, { auth: { persistSession: false } });
    second = createClient(url!, anon!, { auth: { persistSession: false } });
    await first.auth.signInWithPassword({ email: one.email, password });
    await second.auth.signInWithPassword({ email: two.email, password });
    const { error } = await first.from("projects").insert({
      id: projectId,
      user_id: firstUser.id,
      name: "RLS fixture",
      locale: "en"
    });
    if (error) throw error;
    const { error: secondProjectError } = await second.from("projects").insert({
      id: secondProjectId,
      user_id: secondUser.id,
      name: "Second RLS fixture",
      locale: "en"
    });
    if (secondProjectError) throw secondProjectError;
    const { error: versionError } = await first.from("experiment_versions").insert({
      id: versionId,
      project_id: projectId,
      user_id: firstUser.id,
      version: 1,
      experiment: {},
      analysis_config: {}
    });
    if (versionError) throw versionError;
    const { error: jobError } = await first.from("analysis_jobs").insert({
      id: jobId,
      project_id: projectId,
      version_id: versionId,
      user_id: firstUser.id,
      status: "succeeded"
    });
    if (jobError) throw jobError;
    const { error: storageError } = await first.storage
      .from("analysis-artifacts")
      .upload(storagePath, new Blob(["private qPCR artifact"], { type: "text/plain" }));
    if (storageError) throw storageError;
  });

  afterAll(async () => {
    if (!admin) return;
    await first.storage.from("analysis-artifacts").remove([storagePath]);
    await first.from("projects").delete().eq("id", projectId);
    await second.from("projects").delete().eq("id", secondProjectId);
    await admin.auth.admin.deleteUser(firstUser.id);
    await admin.auth.admin.deleteUser(secondUser.id);
  });

  it("hides another user's project on read, update and delete", async () => {
    const read = await second.from("projects").select("id").eq("id", projectId);
    const update = await second.from("projects").update({ name: "intrusion" }).eq("id", projectId).select("id");
    const remove = await second.from("projects").delete().eq("id", projectId).select("id");
    expect(read.data).toEqual([]);
    expect(update.data).toEqual([]);
    expect(remove.data).toEqual([]);
  });

  it("rejects cross-account parent references on insert", async () => {
    const qc = await second.from("qc_decisions").insert({
      version_id: versionId,
      user_id: secondUser.id,
      well_id: "A1",
      decision: "excluded",
      reason: "intrusion"
    });
    const job = await second.from("analysis_jobs").insert({
      project_id: secondProjectId,
      version_id: versionId,
      user_id: secondUser.id,
      status: "succeeded"
    });
    const artifact = await second.from("artifacts").insert({
      job_id: jobId,
      user_id: secondUser.id,
      storage_path: `${secondUser.id}/intrusion.zip`,
      sha256: "0".repeat(64)
    });
    expect(qc.error).not.toBeNull();
    expect(job.error).not.toBeNull();
    expect(artifact.error).not.toBeNull();
  });

  it("prevents cross-account artifact download and deletion", async () => {
    const forbiddenDownload = await second.storage.from("analysis-artifacts").download(storagePath);
    expect(forbiddenDownload.error).not.toBeNull();

    await second.storage.from("analysis-artifacts").remove([storagePath]);
    const ownerDownload = await first.storage.from("analysis-artifacts").download(storagePath);
    expect(ownerDownload.error).toBeNull();
    expect(await ownerDownload.data?.text()).toBe("private qPCR artifact");
  });
});
