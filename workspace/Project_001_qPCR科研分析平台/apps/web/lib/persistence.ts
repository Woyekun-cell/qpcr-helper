import type { AnalysisRequest } from "./analysis-request";
import { currentUser } from "./supabase/server";
import { createHash, randomUUID } from "node:crypto";

export async function persistAuthenticatedResult(request: AnalysisRequest, result: unknown) {
  const { supabase, user } = await currentUser();
  if (!supabase || !user) return null;
  const project = {
    id: request.experiment.projectId,
    user_id: user.id,
    name: request.experiment.name,
    locale: request.experiment.locale
  };
  const { error: projectError } = await supabase.from("projects").upsert(project);
  if (projectError) throw new Error("Could not persist project");

  const { data: latest } = await supabase
    .from("experiment_versions")
    .select("version")
    .eq("project_id", project.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const versionNumber = (latest?.version ?? 0) + 1;
  const { data: version, error: versionError } = await supabase
    .from("experiment_versions")
    .insert({
      project_id: project.id,
      user_id: user.id,
      version: versionNumber,
      experiment: request.experiment,
      analysis_config: { ...request.config, figure: request.figure }
    })
    .select("id")
    .single();
  if (versionError || !version) throw new Error("Could not persist experiment version");
  if (request.qcDecisions && request.qcDecisions.length > 0) {
    const { error: qcError } = await supabase.from("qc_decisions").insert(
      request.qcDecisions.map((decision) => ({
        version_id: version.id,
        user_id: user.id,
        well_id: decision.wellId,
        decision: decision.decision,
        reason: decision.reason,
        decided_at: decision.decidedAt
      }))
    );
    if (qcError) throw new Error("Could not persist QC audit decisions");
  }
  const { data: job, error: jobError } = await supabase
    .from("analysis_jobs")
    .insert({
      project_id: project.id,
      version_id: version.id,
      user_id: user.id,
      status: "succeeded",
      result,
      completed_at: new Date().toISOString()
    })
    .select("id, created_at")
    .single();
  if (jobError || !job) throw new Error("Could not persist analysis job");
  return { id: job.id, createdAt: job.created_at };
}

export async function readAuthenticatedJob(id: string) {
  const { supabase, user } = await currentUser();
  if (!supabase || !user) return null;
  const { data } = await supabase
    .from("analysis_jobs")
    .select("id, status, result, error, created_at, completed_at, version_id")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function readAuthenticatedExportSource(id: string) {
  const { supabase, user } = await currentUser();
  if (!supabase || !user) return null;
  const { data: job } = await supabase
    .from("analysis_jobs")
    .select("result, version_id")
    .eq("id", id)
    .maybeSingle();
  if (!job) return null;
  const { data: version } = await supabase
    .from("experiment_versions")
    .select("id, experiment, analysis_config")
    .eq("id", job.version_id)
    .maybeSingle();
  if (!version) return null;
  const { data: decisions } = await supabase
    .from("qc_decisions")
    .select("well_id, decision, reason, user_id, decided_at")
    .eq("version_id", version.id)
    .order("decided_at", { ascending: true });
  const storedConfig = version.analysis_config as Record<string, unknown>;
  return {
    input: {
      experiment: version.experiment,
      config: {
        design: storedConfig.design,
        calibratorGroup: storedConfig.calibratorGroup,
        contrastMode: storedConfig.contrastMode,
        correction: storedConfig.correction,
        method: storedConfig.method,
        alpha: storedConfig.alpha,
        confidenceLevel: storedConfig.confidenceLevel,
        selectedComparisons: storedConfig.selectedComparisons
      },
      figure: storedConfig.figure,
      qcDecisions: (decisions ?? []).map((decision) => ({
        wellId: decision.well_id,
        decision: decision.decision,
        reason: decision.reason,
        operator: decision.user_id,
        decidedAt: decision.decided_at
      }))
    },
    result: job.result
  };
}

export async function persistAuthenticatedArtifact(jobId: string, zip: ArrayBuffer) {
  const { supabase, user } = await currentUser();
  if (!supabase || !user) return null;
  const sha256 = createHash("sha256").update(Buffer.from(zip)).digest("hex");
  const storagePath = `${user.id}/${jobId}/${randomUUID()}/qpcr-research-package.zip`;
  const { error: storageError } = await supabase.storage
    .from("analysis-artifacts")
    .upload(storagePath, zip, { contentType: "application/zip", upsert: false });
  if (storageError) throw new Error("Could not persist private export artifact");
  const { error: recordError } = await supabase.from("artifacts").insert({
    job_id: jobId,
    user_id: user.id,
    storage_path: storagePath,
    sha256
  });
  if (recordError) {
    await supabase.storage.from("analysis-artifacts").remove([storagePath]);
    throw new Error("Could not register private export artifact");
  }
  return { storagePath, sha256 };
}

export async function deleteAuthenticatedProject(id: string): Promise<boolean> {
  const { supabase, user } = await currentUser();
  if (!supabase || !user) return false;
  const { data: jobs } = await supabase.from("analysis_jobs").select("id").eq("project_id", id);
  const jobIds = (jobs ?? []).map((job) => job.id);
  if (jobIds.length > 0) {
    const { data: artifacts } = await supabase
      .from("artifacts")
      .select("storage_path")
      .in("job_id", jobIds);
    const paths = (artifacts ?? []).map((artifact) => artifact.storage_path);
    if (paths.length > 0) {
      const { error: removeError } = await supabase.storage.from("analysis-artifacts").remove(paths);
      if (removeError) throw new Error("Could not delete private project artifacts");
    }
  }
  const { data, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  return !error && Boolean(data);
}
