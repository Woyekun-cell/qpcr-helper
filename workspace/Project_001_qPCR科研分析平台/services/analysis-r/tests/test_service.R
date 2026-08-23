script_arg <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
service_root <- normalizePath(file.path(dirname(sub("^--file=", "", script_arg[1])), ".."))
setwd(service_root)

source(file.path("R", "statistics.R"))
source(file.path("R", "service.R"))
source(file.path("R", "figures.R"))
source(file.path("R", "export.R"))

if (!request_authorized("Bearer test-secret", "test-secret")) stop("Valid service token was rejected")
if (request_authorized("Bearer wrong", "test-secret")) stop("Invalid service token was accepted")

expect_equal <- function(actual, expected, tolerance = 1e-10) {
  if (!isTRUE(all.equal(actual, expected, tolerance = tolerance, check.attributes = FALSE))) {
    stop(sprintf("Expected %s, got %s", paste(expected, collapse = ", "), paste(actual, collapse = ", ")))
  }
}

samples <- list(
  list(sampleId = "c1", groupId = "control", targetGene = "GENE1", deltaCt = 5.0),
  list(sampleId = "c2", groupId = "control", targetGene = "GENE1", deltaCt = 5.2),
  list(sampleId = "c3", groupId = "control", targetGene = "GENE1", deltaCt = 4.8),
  list(sampleId = "t1", groupId = "treated", targetGene = "GENE1", deltaCt = 2.0),
  list(sampleId = "t2", groupId = "treated", targetGene = "GENE1", deltaCt = 2.1),
  list(sampleId = "t3", groupId = "treated", targetGene = "GENE1", deltaCt = 1.9)
)

payload <- list(
  samples = samples,
  config = list(
    design = "independent_two_group",
    calibratorGroup = "control",
    correction = "holm",
    contrastMode = "selected",
    method = "recommended",
    alpha = 0.05,
    confidenceLevel = 0.90
  )
)

result <- run_analysis_payload(payload)
expect_equal(result$status, "succeeded")
expect_equal(result$analysisUnit, "biological replicate")
expect_equal(result$contrasts$fold_change, 8)
expect_equal(result$config$alpha, 0.05)
expect_equal(result$config$confidenceLevel, 0.90)
if (!isTRUE(result$contrasts$significant_family)) stop("Configured alpha was not applied to adjusted p values")
if (!is.null(result$analyses[[1]]$model)) stop("API result must not expose non-serializable model objects")

multi_gene <- payload
multi_gene$samples <- c(
  samples,
  lapply(samples, function(sample) {
    sample$sampleId <- paste0(sample$sampleId, "-g2")
    sample$targetGene <- "GENE2"
    sample$deltaCt <- sample$deltaCt + ifelse(sample$groupId == "treated", 1.5, 0)
    sample
  })
)
multi_gene$config$correction <- "BH"
family <- run_analysis_payload(multi_gene)
expect_equal(nrow(family$contrasts), 2)
expect_equal(
  family$contrasts$p_adjusted_family,
  stats::p.adjust(family$contrasts$p_value, method = "BH")
)

invalid <- payload
invalid$config$calibratorGroup <- "missing"
message <- tryCatch({
  run_analysis_payload(invalid)
  NA_character_
}, error = function(error) conditionMessage(error))
if (!identical(message, "Unknown calibrator group: missing")) {
  stop(sprintf("Unexpected validation error: %s", message))
}

preview <- run_preview_payload(list(
  samples = samples,
  config = payload$config,
  figure = list(plotType = "dot", widthMm = 90, heightMm = 70),
  title = "GENE1"
))
if (!identical(preview$status, "succeeded")) stop("Preview helper did not succeed")
if (!grepl("<svg", preview$svg, fixed = TRUE)) stop("Preview helper did not return SVG")

export_payload <- list(
  projectName = "Service fixture",
  rawWells = list(
    list(wellId = "A1", sampleId = "c1", groupId = "control", gene = "GENE1", ct = 25)
  ),
  samples = samples,
  qc = list(list(code = "SINGLE_REFERENCE_GENE", severity = "info", message = "Validate stability")),
  analysis = list(
    method = result$analyses[[1]]$method,
    contrasts = split(result$contrasts, seq_len(nrow(result$contrasts))),
    omnibus = list()
  ),
  config = payload$config,
  figure = list(plotType = "dot", widthMm = 90, heightMm = 70, dpi = 300),
  locale = "en"
)
service_export <- run_export_payload(export_payload, destination = tempfile("service-export-"))
if (!file.exists(service_export$zip)) stop("Service export helper did not create a ZIP")

cat("service tests passed\n")
