script_arg <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
service_root <- normalizePath(file.path(dirname(sub("^--file=", "", script_arg[1])), ".."))
setwd(service_root)

source(file.path("R", "statistics.R"))

expect_equal <- function(actual, expected, tolerance = 1e-10) {
  if (!isTRUE(all.equal(actual, expected, tolerance = tolerance, check.attributes = FALSE))) {
    stop(sprintf("Expected %s, got %s", paste(expected, collapse = ", "), paste(actual, collapse = ", ")))
  }
}

expect_error <- function(expression, pattern) {
  message <- tryCatch({
    force(expression)
    NA_character_
  }, error = function(error) conditionMessage(error))
  if (is.na(message) || !grepl(pattern, message, fixed = TRUE)) {
    stop(sprintf("Expected error containing '%s', got '%s'", pattern, message))
  }
}

expect_equal(
  recommend_statistics("independent_two_group"),
  list(primary = "welch_t", alternative = "mann_whitney", correction = "holm")
)
expect_equal(
  recommend_statistics("paired_two_group"),
  list(primary = "paired_t", alternative = "wilcoxon_signed_rank", correction = "holm")
)
expect_equal(
  recommend_statistics("one_way", contrast_mode = "all_pairwise"),
  list(primary = "welch_anova", posthoc = "games_howell", alternative = "kruskal_dunn", correction = "games_howell")
)
expect_equal(
  recommend_statistics("two_way"),
  list(primary = "factorial_linear_model", terms = c("factorA", "factorB", "factorA:factorB"), correction = "holm")
)
expect_equal(
  recommend_statistics("repeated_time"),
  list(primary = "mixed_model", terms = c("groupId", "time", "groupId:time"), random = "subjectId", correction = "holm")
)

expect_equal(adjust_pvalues(c(0.01, 0.02, 0.2), "holm"), c(0.03, 0.04, 0.2))
expect_equal(adjust_pvalues(c(0.01, 0.02, 0.2), "BH"), c(0.03, 0.03, 0.2))

fixture <- data.frame(
  sampleId = c("c1", "c2", "c3", "t1", "t2", "t3"),
  groupId = factor(c("control", "control", "control", "treated", "treated", "treated"), levels = c("control", "treated")),
  targetGene = "GENE1",
  deltaCt = c(5.0, 5.2, 4.8, 2.0, 2.1, 1.9),
  stringsAsFactors = FALSE
)

result <- run_statistics(
  fixture,
  design = "independent_two_group",
  calibrator_group = "control",
  correction = "holm"
)
expect_equal(result$method, "Welch two-sample t-test")
expect_equal(result$independent_n, c(control = 3, treated = 3))
if (!identical(result$diagnostics$automatic_switch, FALSE)) stop("Diagnostics must never silently switch methods")
expect_equal(result$diagnostics$minimum_group_n, 3)
if (!is.finite(result$diagnostics$residual_normality_p)) stop("Residual normality diagnostic is missing")
if (!is.finite(result$diagnostics$variance_homogeneity_p)) stop("Variance diagnostic is missing")
if (!is.character(result$diagnostics$recommendation_note)) stop("Diagnostic recommendation note is missing")
expect_equal(round(result$contrasts$fold_change, 8), 8)
if (!(result$contrasts$p_value < 0.001)) stop("Expected a small p value for the known fixture")
if (!all(c("estimate_delta_ct", "ci_low_delta_ct", "ci_high_delta_ct", "p_value", "p_adjusted") %in% names(result$contrasts))) {
  stop("Contrast output is missing required reporting fields")
}
result_90 <- run_statistics(
  fixture,
  design = "independent_two_group",
  calibrator_group = "control",
  correction = "holm",
  confidence_level = 0.90
)
width_95 <- result$contrasts$ci_high_delta_ct - result$contrasts$ci_low_delta_ct
width_90 <- result_90$contrasts$ci_high_delta_ct - result_90$contrasts$ci_low_delta_ct
if (!(width_90 < width_95)) stop("A 90% interval must be narrower than a 95% interval")
expect_equal(result_90$diagnostics$confidence_level, 0.90)

nonparametric_two_group <- run_statistics(
  fixture,
  design = "independent_two_group",
  calibrator_group = "control",
  method = "nonparametric"
)
expect_equal(nonparametric_two_group$method, "Mann-Whitney U test")
named_nonparametric <- run_statistics(
  fixture,
  design = "independent_two_group",
  calibrator_group = "control",
  method = "mann_whitney"
)
expect_equal(named_nonparametric$method, "Mann-Whitney U test")
if (!is.finite(nonparametric_two_group$contrasts$estimate_delta_ct)) {
  stop("Nonparametric contrast must include a Hodges-Lehmann estimate")
}

paired_missing_subject <- transform(fixture[1:4, ], groupId = factor(c("control", "control", "treated", "treated")))
expect_error(
  run_statistics(paired_missing_subject, design = "paired_two_group", calibrator_group = "control"),
  "paired_two_group requires subjectId"
)

paired_fixture <- data.frame(
  sampleId = c(paste0("c", 1:6), paste0("t", 1:6)),
  subjectId = rep(paste0("subject-", 1:6), 2),
  groupId = factor(c(rep("control", 6), rep("treated", 6)), levels = c("control", "treated")),
  targetGene = "GENE1",
  deltaCt = c(
    5.0, 5.2, 4.8, 5.1, 4.9, 5.3,
    c(5.0, 5.2, 4.8, 5.1, 4.9, 5.3) - c(1.7, 1.8, 1.9, 2.1, 2.2, 2.3)
  ),
  stringsAsFactors = FALSE
)
paired_result <- run_statistics(
  paired_fixture,
  design = "paired_two_group",
  calibrator_group = "control"
)
expect_equal(paired_result$method, "Paired t-test")
expect_equal(round(paired_result$contrasts$fold_change, 8), 4)
paired_nonparametric <- run_statistics(
  paired_fixture,
  design = "paired_two_group",
  calibrator_group = "control",
  method = "wilcoxon"
)
expect_equal(paired_nonparametric$method, "Wilcoxon signed-rank test")
expect_equal(paired_nonparametric$independent_n, c(control = 6, treated = 6))

one_way_fixture <- data.frame(
  sampleId = paste0("s", 1:9),
  groupId = factor(rep(c("control", "low", "high"), each = 3), levels = c("control", "low", "high")),
  targetGene = "GENE1",
  deltaCt = c(5.0, 5.2, 4.8, 4.0, 4.1, 3.9, 2.0, 2.1, 1.9),
  stringsAsFactors = FALSE
)
one_way <- run_statistics(
  one_way_fixture,
  design = "one_way",
  calibrator_group = "control",
  contrast_mode = "all_pairwise"
)
expect_equal(one_way$method, "Welch one-way ANOVA with Games-Howell comparisons")
expect_equal(nrow(one_way$contrasts), 3)
high_control <- one_way$contrasts[
  one_way$contrasts$contrast == "high - control",
  ,
  drop = FALSE
]
expect_equal(round(high_control$fold_change, 8), 8)
if (!(one_way$omnibus$p_value < 0.001)) stop("Expected a small Welch ANOVA p value")

dunnett <- run_statistics(
  one_way_fixture,
  design = "one_way",
  calibrator_group = "control",
  contrast_mode = "control"
)
expect_equal(dunnett$method, "One-way ANOVA with Dunnett comparisons")
expect_equal(nrow(dunnett$contrasts), 2)
expect_equal(
  dunnett$contrasts$p_adjusted,
  c(2.37327703360601e-04, 3.91502528285237e-07)
)
if (!all(dunnett$contrasts$p_value <= dunnett$contrasts$p_adjusted)) {
  stop("Dunnett output must distinguish raw and simultaneous adjusted p values")
}
if (!all(grepl("- control", dunnett$contrasts$contrast, fixed = TRUE))) {
  stop("Dunnett output must compare each treatment with the calibrator")
}

tukey <- run_statistics(
  one_way_fixture,
  design = "one_way",
  calibrator_group = "control",
  contrast_mode = "all_pairwise",
  method = "equal_variance"
)
expect_equal(tukey$method, "One-way ANOVA with Tukey HSD comparisons")
expect_equal(nrow(tukey$contrasts), 3)
expect_equal(
  tukey$contrasts$p_adjusted,
  c(3.21024793707991e-04, 7.28528366744641e-07, 5.42583224449888e-06)
)
named_tukey <- run_statistics(
  one_way_fixture,
  design = "one_way",
  calibrator_group = "control",
  contrast_mode = "all_pairs",
  correction = "tukey",
  method = "anova"
)
expect_equal(named_tukey$method, "One-way ANOVA with Tukey HSD comparisons")

selected <- run_statistics(
  one_way_fixture,
  design = "one_way",
  calibrator_group = "control",
  contrast_mode = "selected",
  correction = "holm",
  selected_comparisons = list(list(numerator = "high", denominator = "low"))
)
expect_equal(selected$method, "Welch t-tests for selected comparisons")
expect_equal(selected$contrasts$contrast, "high - low")
expect_equal(round(selected$contrasts$fold_change, 8), 4)

dunn <- run_statistics(
  one_way_fixture,
  design = "one_way",
  calibrator_group = "control",
  contrast_mode = "all_pairwise",
  method = "nonparametric"
)
expect_equal(dunn$method, "Kruskal-Wallis test with Dunn comparisons")
expect_equal(nrow(dunn$contrasts), 3)
if (!all(dunn$contrasts$p_adjusted >= dunn$contrasts$p_value)) {
  stop("Dunn adjusted p values must not be smaller than raw p values in this fixture")
}

factorial_fixture <- expand.grid(
  factorA = c("vehicle", "drug"),
  factorB = c("early", "late"),
  replicate = 1:4,
  stringsAsFactors = FALSE
)
factorial_fixture$sampleId <- paste0("f", seq_len(nrow(factorial_fixture)))
factorial_fixture$groupId <- paste(factorial_fixture$factorA, factorial_fixture$factorB, sep = "_")
factorial_fixture$targetGene <- "GENE1"
factorial_noise <- c(-0.12, 0.04, 0.08, -0.03, 0.11, -0.07, 0.02, 0.05, -0.09, 0.13, -0.01, 0.07, 0.03, -0.05, 0.10, -0.08)
factorial_fixture$deltaCt <- with(
  factorial_fixture,
  5 - 2 * (factorA == "drug") - 1 * (factorB == "late") - 1 * (factorA == "drug" & factorB == "late") + factorial_noise
)
factorial <- run_statistics(
  factorial_fixture,
  design = "two_way",
  calibrator_group = "vehicle_early"
)
expect_equal(factorial$method, "Two-way linear model with interaction")
expect_equal(factorial$omnibus$term, c("factorA", "factorB", "factorA:factorB", "Residuals"))
if (!(factorial$omnibus$p_value[3] < 0.05)) stop("Expected the interaction term to be tested directly")

repeated_fixture <- expand.grid(
  subjectId = paste0("subject-", 1:12),
  time = c(0, 1, 2),
  stringsAsFactors = FALSE
)
repeated_fixture$groupId <- ifelse(as.integer(sub("subject-", "", repeated_fixture$subjectId)) <= 6, "control", "treated")
repeated_fixture$sampleId <- paste(repeated_fixture$subjectId, repeated_fixture$time, sep = "-")
repeated_fixture$targetGene <- "GENE1"
subject_offset <- rep(c(-1.10, -0.60, -0.20, 0.20, 0.60, 1.10), 2)
repeated_noise <- 0.09 * sin(seq_len(nrow(repeated_fixture))) + 0.03 * cos(seq_len(nrow(repeated_fixture)) * 0.7)
subject_index <- as.integer(sub("subject-", "", repeated_fixture$subjectId))
repeated_fixture$deltaCt <- 5 + subject_offset[subject_index] - 0.8 * (repeated_fixture$groupId == "treated") - 0.4 * repeated_fixture$time - 0.5 * (repeated_fixture$groupId == "treated") * repeated_fixture$time + repeated_noise

repeated <- run_statistics(
  repeated_fixture,
  design = "repeated_time",
  calibrator_group = "control"
)
expect_equal(repeated$method, "Linear mixed model with subject random intercept")
expect_equal(repeated$omnibus$term, c("groupId", "time", "groupId:time"))
if (!all(is.finite(repeated$omnibus$p_value))) stop("Mixed-model tests must report finite p values")

cat("statistics tests passed\n")
