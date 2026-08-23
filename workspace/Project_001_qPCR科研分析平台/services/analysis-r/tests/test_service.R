script_arg <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
service_root <- normalizePath(file.path(dirname(sub("^--file=", "", script_arg[1])), ".."))
setwd(service_root)

source(file.path("R", "statistics.R"))
source(file.path("R", "service.R"))

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
    method = "recommended"
  )
)

result <- run_analysis_payload(payload)
expect_equal(result$status, "succeeded")
expect_equal(result$analysisUnit, "biological replicate")
expect_equal(result$contrasts$fold_change, 8)
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

cat("service tests passed\n")
