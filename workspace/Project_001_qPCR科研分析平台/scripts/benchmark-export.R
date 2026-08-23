args <- commandArgs(trailingOnly = FALSE)
script_path <- sub("^--file=", "", grep("^--file=", args, value = TRUE)[1])
project_root <- normalizePath(file.path(dirname(script_path), ".."))
setwd(file.path(project_root, "services", "analysis-r"))
source(file.path("R", "figures.R"))
source(file.path("R", "export.R"))

sample_count <- 2500L
sample_ids <- sprintf("S%04d", seq_len(sample_count))
groups <- rep(c("control", "treated"), each = sample_count / 2)
samples <- data.frame(
  sampleId = sample_ids,
  biologicalReplicateId = sample_ids,
  groupId = groups,
  targetGene = "GENE1",
  deltaCt = 5 - 3 * (groups == "treated") + 0.2 * sin(seq_len(sample_count)),
  stringsAsFactors = FALSE
)
samples$deltaDeltaCt <- samples$deltaCt - mean(samples$deltaCt[samples$groupId == "control"])
samples$foldChange <- 2^(-samples$deltaDeltaCt)
raw_wells <- do.call(rbind, lapply(seq_len(sample_count), function(index) {
  data.frame(
    wellId = sprintf("W%05d", (index - 1L) * 4L + seq_len(4L)),
    sampleId = sample_ids[index],
    biologicalReplicateId = sample_ids[index],
    technicalReplicateId = rep(c("1", "2"), 2),
    groupId = groups[index],
    gene = rep(c("GENE1", "GAPDH"), each = 2),
    geneRole = rep(c("target", "reference"), each = 2),
    ct = c(samples$deltaCt[index] + 20.01, samples$deltaCt[index] + 19.99, 20.01, 19.99),
    status = "accepted",
    stringsAsFactors = FALSE
  )
}))
analysis <- list(
  method = "Welch two-sample t-test",
  contrasts = data.frame(
    contrast = "treated - control",
    fold_change = 8,
    fold_change_ci_low = 7.9,
    fold_change_ci_high = 8.1,
    p_value = 1e-12,
    p_adjusted = 1e-12
  ),
  omnibus = data.frame(),
  diagnostics = data.frame(automatic_switch = FALSE)
)
config <- list(
  design = "independent_two_group",
  calibratorGroup = "control",
  contrastMode = "selected",
  correction = "holm",
  method = "recommended",
  alpha = 0.05,
  confidenceLevel = 0.95
)
destination <- tempfile("qpcr-export-benchmark-")
dir.create(destination)
elapsed <- system.time({
  bundle <- create_research_export(
    destination = destination,
    project_name = "10k benchmark",
    raw_wells = raw_wells,
    samples = samples,
    qc = data.frame(),
    analysis = analysis,
    config = config,
    plot_type = "dot",
    width_mm = 90,
    height_mm = 70,
    dpi = 300,
    locale = "en"
  )
})[["elapsed"]]
if (!file.exists(bundle$zip) || file.info(bundle$zip)$size <= 0) stop("Benchmark export was not created")
roundtrip <- openxlsx::read.xlsx(file.path(bundle$directory, "qpcr_roundtrip.xlsx"), sheet = "Ct_Data")
if (nrow(roundtrip) != 10000L || !all(c("biological_replicate", "technical_replicate", "status") %in% names(roundtrip))) {
  stop("10,000-well XLSX round-trip verification failed")
}
cat(sprintf('{"wells":%d,"samples":%d,"elapsedSeconds":%.3f,"zipBytes":%d}\n', nrow(raw_wells), nrow(samples), elapsed, file.info(bundle$zip)$size))
if (elapsed >= 60) stop(sprintf("10,000-well export exceeded 60 seconds: %.3f", elapsed))
