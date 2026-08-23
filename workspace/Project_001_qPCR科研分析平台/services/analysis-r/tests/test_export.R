script_arg <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
service_root <- normalizePath(file.path(dirname(sub("^--file=", "", script_arg[1])), ".."))
setwd(service_root)

source(file.path("R", "figures.R"))
source(file.path("R", "export.R"))

samples <- data.frame(
  sampleId = c("c1", "c2", "c3", "t1", "t2", "t3"),
  biologicalReplicateId = c("c1", "c2", "c3", "t1", "t2", "t3"),
  groupId = factor(c("control", "control", "control", "treated", "treated", "treated"), levels = c("control", "treated")),
  targetGene = "GENE1",
  deltaCt = c(5.0, 5.2, 4.8, 2.0, 2.1, 1.9),
  deltaDeltaCt = c(0.0, 0.2, -0.2, -3.0, -2.9, -3.1),
  foldChange = 2^-c(0.0, 0.2, -0.2, -3.0, -2.9, -3.1),
  stringsAsFactors = FALSE
)
contrasts <- data.frame(
  target_gene = "GENE1",
  contrast = "treated - control",
  estimate_delta_ct = -3,
  ci_low_delta_ct = -3.4,
  ci_high_delta_ct = -2.6,
  fold_change = 8,
  fold_change_ci_low = 2^2.6,
  fold_change_ci_high = 2^3.4,
  statistic = -20,
  degrees_freedom = 3.2,
  p_value = 0.00025,
  p_adjusted = 0.00025,
  p_adjusted_family = 0.00025,
  stringsAsFactors = FALSE
)
raw_wells <- data.frame(
  wellId = c("A1", "A2"),
  sampleId = c("c1", "c1"),
  groupId = c("=HYPERLINK(\"https://example.test\")", "control"),
  gene = c("GENE1", "GAPDH"),
  ct = c(25, 20),
  stringsAsFactors = FALSE
)
qc <- data.frame(
  code = "SINGLE_REFERENCE_GENE",
  severity = "info",
  message = "Reference stability must be independently validated.",
  stringsAsFactors = FALSE
)
analysis <- list(
  method = "Welch two-sample t-test",
  contrasts = contrasts,
  omnibus = data.frame(),
  diagnostics = list(analysis_unit = "biological replicate", scale = "delta Ct")
)
config <- list(
  design = "independent_two_group",
  calibratorGroup = "control",
  correction = "Holm",
  contrastMode = "selected",
  method = "recommended"
)

destination <- tempfile("qpcr-export-")
dir.create(destination)
bundle <- create_research_export(
  destination = destination,
  project_name = "Known fixture",
  raw_wells = raw_wells,
  samples = samples,
  qc = qc,
  analysis = analysis,
  config = config,
  plot_type = "dot",
  width_mm = 90,
  height_mm = 70,
  dpi = 300,
  locale = "en"
)

if (!file.exists(bundle$zip)) stop("Research ZIP was not created")
entries <- utils::unzip(bundle$zip, list = TRUE)$Name
required <- c(
  "raw_input.json",
  "raw_wells_safe.csv",
  "clean_samples.csv",
  "qc_log.csv",
  "statistics.xlsx",
  "figure.svg",
  "figure.pdf",
  "figure.tiff",
  "figure.png",
  "figure_legend.txt",
  "methods.txt",
  "parameters.json",
  "reproduce.R",
  "sessionInfo.txt",
  "manifest.json"
)
if (!all(required %in% entries)) stop(sprintf("ZIP missing: %s", paste(setdiff(required, entries), collapse = ", ")))

safe_csv <- readLines(file.path(bundle$directory, "raw_wells_safe.csv"), warn = FALSE)
if (!any(grepl("'=HYPERLINK", safe_csv, fixed = TRUE))) stop("CSV formula injection was not neutralized")
raw_json <- jsonlite::read_json(file.path(bundle$directory, "raw_input.json"), simplifyVector = TRUE)
if (!identical(raw_json$groupId[1], "=HYPERLINK(\"https://example.test\")")) stop("Raw JSON must preserve original input")
manifest <- jsonlite::read_json(file.path(bundle$directory, "manifest.json"), simplifyVector = TRUE)
if (!all(c("path", "bytes", "sha256") %in% names(manifest$files))) stop("Manifest is missing file integrity fields")
if (!all(grepl("^[a-f0-9]{64}$", manifest$files$sha256))) stop("Manifest SHA-256 values are invalid")
if (!all(c("appVersion", "rVersion", "parameters") %in% names(manifest))) stop("Manifest is missing reproducibility metadata")

cat("export tests passed\n")
