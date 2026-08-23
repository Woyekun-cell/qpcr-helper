recommend_statistics <- function(design, contrast_mode = "selected") {
  switch(
    design,
    independent_two_group = list(
      primary = "welch_t",
      alternative = "mann_whitney",
      correction = "holm"
    ),
    paired_two_group = list(
      primary = "paired_t",
      alternative = "wilcoxon_signed_rank",
      correction = "holm"
    ),
    one_way = if (contrast_mode %in% c("all_pairwise", "all_pairs")) {
      list(
        primary = "welch_anova",
        posthoc = "games_howell",
        alternative = "kruskal_dunn",
        correction = "games_howell"
      )
    } else {
      list(
        primary = "welch_anova",
        posthoc = "selected_contrasts",
        alternative = "kruskal_dunn",
        correction = "holm"
      )
    },
    two_way = list(
      primary = "factorial_linear_model",
      terms = c("factorA", "factorB", "factorA:factorB"),
      correction = "holm"
    ),
    repeated_time = list(
      primary = "mixed_model",
      terms = c("groupId", "time", "groupId:time"),
      random = "subjectId",
      correction = "holm"
    ),
    stop(sprintf("Unsupported design: %s", design))
  )
}

adjust_pvalues <- function(p_values, method) {
  normalized <- switch(
    tolower(method),
    bh = "BH",
    fdr = "BH",
    holm = "holm",
    bonferroni = "bonferroni",
    none = "none",
    stop(sprintf("Unsupported p-value correction: %s", method))
  )
  stats::p.adjust(p_values, method = normalized)
}

validate_statistics_input <- function(data, design, calibrator_group) {
  required <- c("sampleId", "groupId", "targetGene", "deltaCt")
  missing <- setdiff(required, names(data))
  if (length(missing) > 0) {
    stop(sprintf("Statistics input is missing: %s", paste(missing, collapse = ", ")))
  }
  if (!calibrator_group %in% as.character(data$groupId)) {
    stop(sprintf("Unknown calibrator group: %s", calibrator_group))
  }
  if (anyDuplicated(paste(data$sampleId, data$targetGene, sep = "::"))) {
    stop("Each sample/targetGene pair must appear once; aggregate technical replicates first")
  }
  if (design %in% c("paired_two_group", "repeated_time") && !"subjectId" %in% names(data)) {
    stop(sprintf("%s requires subjectId", design))
  }
  if (design == "two_way" && !all(c("factorA", "factorB") %in% names(data))) {
    stop("two_way requires factorA and factorB")
  }
  if (design == "repeated_time" && !"time" %in% names(data)) {
    stop("repeated_time requires time")
  }
  invisible(TRUE)
}

two_group_statistics <- function(data, design, calibrator_group, correction, confidence_level) {
  groups <- unique(as.character(data$groupId))
  if (length(groups) != 2) stop(sprintf("%s requires exactly two groups", design))
  treatment_group <- setdiff(groups, calibrator_group)
  control <- data[data$groupId == calibrator_group, , drop = FALSE]
  treatment <- data[data$groupId == treatment_group, , drop = FALSE]

  if (design == "paired_two_group") {
    control <- control[order(control$subjectId), , drop = FALSE]
    treatment <- treatment[order(treatment$subjectId), , drop = FALSE]
    if (!identical(as.character(control$subjectId), as.character(treatment$subjectId))) {
      stop("Paired groups must contain matching subjectId values")
    }
    test <- stats::t.test(treatment$deltaCt, control$deltaCt, paired = TRUE, conf.level = confidence_level)
    method <- "Paired t-test"
  } else {
    test <- stats::t.test(treatment$deltaCt, control$deltaCt, var.equal = FALSE, conf.level = confidence_level)
    method <- "Welch two-sample t-test"
  }

  estimate <- unname(mean(treatment$deltaCt) - mean(control$deltaCt))
  contrast <- data.frame(
    target_gene = unique(as.character(data$targetGene)),
    contrast = sprintf("%s - %s", treatment_group, calibrator_group),
    estimate_delta_ct = estimate,
    ci_low_delta_ct = unname(test$conf.int[1]),
    ci_high_delta_ct = unname(test$conf.int[2]),
    fold_change = 2^(-estimate),
    fold_change_ci_low = 2^(-unname(test$conf.int[2])),
    fold_change_ci_high = 2^(-unname(test$conf.int[1])),
    statistic = unname(test$statistic),
    degrees_freedom = unname(test$parameter),
    p_value = test$p.value,
    stringsAsFactors = FALSE
  )
  contrast$p_adjusted <- adjust_pvalues(contrast$p_value, correction)

  group_n <- table(data$groupId)
  independent_n <- stats::setNames(as.integer(group_n), names(group_n))

  list(
    method = method,
    independent_n = independent_n,
    contrasts = contrast,
    diagnostics = list(
      analysis_unit = "biological replicate",
      scale = "delta Ct",
      confidence_level = confidence_level,
      alternative = recommend_statistics(design)$alternative
    )
  )
}

nonparametric_two_group_statistics <- function(data, design, calibrator_group, correction, confidence_level) {
  groups <- unique(as.character(data$groupId))
  if (length(groups) != 2) stop(sprintf("%s requires exactly two groups", design))
  treatment_group <- setdiff(groups, calibrator_group)
  control <- data[data$groupId == calibrator_group, , drop = FALSE]
  treatment <- data[data$groupId == treatment_group, , drop = FALSE]
  paired <- identical(design, "paired_two_group")
  if (paired) {
    control <- control[order(control$subjectId), , drop = FALSE]
    treatment <- treatment[order(treatment$subjectId), , drop = FALSE]
    if (!identical(as.character(control$subjectId), as.character(treatment$subjectId))) {
      stop("Paired groups must contain matching subjectId values")
    }
  }
  test <- stats::wilcox.test(
    treatment$deltaCt,
    control$deltaCt,
    paired = paired,
    conf.int = TRUE,
    conf.level = confidence_level,
    exact = FALSE,
    correct = FALSE
  )
  estimate <- unname(test$estimate)
  interval <- unname(test$conf.int)
  contrast <- data.frame(
    target_gene = unique(as.character(data$targetGene)),
    contrast = sprintf("%s - %s", treatment_group, calibrator_group),
    estimate_delta_ct = estimate,
    ci_low_delta_ct = interval[1],
    ci_high_delta_ct = interval[2],
    fold_change = 2^(-estimate),
    fold_change_ci_low = 2^(-interval[2]),
    fold_change_ci_high = 2^(-interval[1]),
    statistic = unname(test$statistic),
    degrees_freedom = NA_real_,
    p_value = test$p.value,
    stringsAsFactors = FALSE
  )
  contrast$p_adjusted <- adjust_pvalues(contrast$p_value, correction)
  list(
    method = if (paired) "Wilcoxon signed-rank test" else "Mann-Whitney U test",
    independent_n = {
      group_n <- table(data$groupId)
      stats::setNames(as.integer(group_n), names(group_n))
    },
    contrasts = contrast,
    diagnostics = list(
      analysis_unit = if (paired) "paired subject" else "biological replicate",
      scale = "delta Ct",
      confidence_level = confidence_level,
      estimate = "Hodges-Lehmann location shift"
    )
  )
}

games_howell_contrasts <- function(data, confidence_level) {
  groups <- if (is.factor(data$groupId)) levels(droplevels(data$groupId)) else unique(as.character(data$groupId))
  pairs <- utils::combn(groups, 2, simplify = FALSE)
  rows <- lapply(pairs, function(pair) {
    first <- data$deltaCt[as.character(data$groupId) == pair[1]]
    second <- data$deltaCt[as.character(data$groupId) == pair[2]]
    n_first <- length(first)
    n_second <- length(second)
    variance_first <- stats::var(first)
    variance_second <- stats::var(second)
    standard_error <- sqrt(variance_first / n_first + variance_second / n_second)
    estimate <- mean(second) - mean(first)
    degrees_freedom <- (variance_first / n_first + variance_second / n_second)^2 /
      ((variance_first / n_first)^2 / (n_first - 1) + (variance_second / n_second)^2 / (n_second - 1))
    statistic <- estimate / standard_error
    critical <- stats::qtukey(confidence_level, nmeans = length(groups), df = degrees_freedom) / sqrt(2)
    ci_low <- estimate - critical * standard_error
    ci_high <- estimate + critical * standard_error
    p_raw <- 2 * stats::pt(-abs(statistic), df = degrees_freedom)
    p_adjusted <- stats::ptukey(
      abs(statistic) * sqrt(2),
      nmeans = length(groups),
      df = degrees_freedom,
      lower.tail = FALSE
    )
    data.frame(
      target_gene = unique(as.character(data$targetGene)),
      contrast = sprintf("%s - %s", pair[2], pair[1]),
      estimate_delta_ct = estimate,
      ci_low_delta_ct = ci_low,
      ci_high_delta_ct = ci_high,
      fold_change = 2^(-estimate),
      fold_change_ci_low = 2^(-ci_high),
      fold_change_ci_high = 2^(-ci_low),
      statistic = statistic,
      degrees_freedom = degrees_freedom,
      p_value = p_raw,
      p_adjusted = p_adjusted,
      stringsAsFactors = FALSE
    )
  })
  do.call(rbind, rows)
}

one_way_statistics <- function(data, confidence_level) {
  if (length(unique(as.character(data$groupId))) < 3) {
    stop("one_way requires at least three groups")
  }
  omnibus_test <- stats::oneway.test(deltaCt ~ groupId, data = data, var.equal = FALSE)
  list(
    method = "Welch one-way ANOVA with Games-Howell comparisons",
    independent_n = {
      group_n <- table(data$groupId)
      stats::setNames(as.integer(group_n), names(group_n))
    },
    omnibus = data.frame(
      term = "groupId",
      statistic = unname(omnibus_test$statistic),
      numerator_df = unname(omnibus_test$parameter[1]),
      denominator_df = unname(omnibus_test$parameter[2]),
      p_value = omnibus_test$p.value,
      stringsAsFactors = FALSE
    ),
    contrasts = games_howell_contrasts(data, confidence_level),
    diagnostics = list(
      analysis_unit = "biological replicate",
      scale = "delta Ct",
      confidence_level = confidence_level,
      variance_model = "unequal variances"
    )
  )
}

tukey_statistics <- function(data, confidence_level) {
  data$groupId <- droplevels(factor(data$groupId))
  model <- stats::aov(deltaCt ~ groupId, data = data)
  tukey <- stats::TukeyHSD(model, "groupId", conf.level = confidence_level)$groupId
  groups <- levels(data$groupId)
  pairs <- utils::combn(groups, 2, simplify = FALSE)
  raw_p <- vapply(pairs, function(pair) {
    stats::t.test(
      data$deltaCt[data$groupId == pair[2]],
      data$deltaCt[data$groupId == pair[1]],
      var.equal = TRUE
    )$p.value
  }, numeric(1))
  contrasts <- data.frame(
    target_gene = unique(as.character(data$targetGene)),
    contrast = vapply(pairs, function(pair) sprintf("%s - %s", pair[2], pair[1]), character(1)),
    estimate_delta_ct = tukey[, "diff"],
    ci_low_delta_ct = tukey[, "lwr"],
    ci_high_delta_ct = tukey[, "upr"],
    fold_change = 2^(-tukey[, "diff"]),
    fold_change_ci_low = 2^(-tukey[, "upr"]),
    fold_change_ci_high = 2^(-tukey[, "lwr"]),
    statistic = NA_real_,
    degrees_freedom = stats::df.residual(model),
    p_value = raw_p,
    p_adjusted = tukey[, "p adj"],
    stringsAsFactors = FALSE
  )
  anova_table <- summary(model)[[1]]
  list(
    method = "One-way ANOVA with Tukey HSD comparisons",
    independent_n = {
      group_n <- table(data$groupId)
      stats::setNames(as.integer(group_n), names(group_n))
    },
    omnibus = data.frame(
      term = "groupId",
      statistic = unname(anova_table[1, "F value"]),
      numerator_df = unname(anova_table[1, "Df"]),
      denominator_df = unname(anova_table[2, "Df"]),
      p_value = unname(anova_table[1, "Pr(>F)"]),
      stringsAsFactors = FALSE
    ),
    contrasts = contrasts,
    diagnostics = list(
      analysis_unit = "biological replicate",
      scale = "delta Ct",
      confidence_level = confidence_level,
      variance_model = "equal variances"
    )
  )
}

dunn_statistics <- function(data, calibrator_group, contrast_mode, correction, confidence_level) {
  has_rstatix <- suppressMessages(requireNamespace("rstatix", quietly = TRUE))
  if (!has_rstatix) {
    stop("Dunn comparisons require the rstatix package")
  }
  omnibus_test <- stats::kruskal.test(deltaCt ~ groupId, data = data)
  dunn <- suppressMessages(
    rstatix::dunn_test(data, deltaCt ~ groupId, p.adjust.method = correction)
  )
  if (contrast_mode == "control") {
    dunn <- dunn[dunn$group1 == calibrator_group | dunn$group2 == calibrator_group, , drop = FALSE]
  }
  rows <- lapply(seq_len(nrow(dunn)), function(index) {
    first_group <- as.character(dunn$group1[index])
    second_group <- as.character(dunn$group2[index])
    first <- data$deltaCt[as.character(data$groupId) == first_group]
    second <- data$deltaCt[as.character(data$groupId) == second_group]
    estimate <- stats::wilcox.test(
      second,
      first,
      conf.int = TRUE,
      conf.level = confidence_level,
      exact = FALSE,
      correct = FALSE
    )
    interval <- unname(estimate$conf.int)
    location <- unname(estimate$estimate)
    data.frame(
      target_gene = unique(as.character(data$targetGene)),
      contrast = sprintf("%s - %s", second_group, first_group),
      estimate_delta_ct = location,
      ci_low_delta_ct = interval[1],
      ci_high_delta_ct = interval[2],
      fold_change = 2^(-location),
      fold_change_ci_low = 2^(-interval[2]),
      fold_change_ci_high = 2^(-interval[1]),
      statistic = unname(dunn$statistic[index]),
      degrees_freedom = NA_real_,
      p_value = unname(dunn$p[index]),
      p_adjusted = unname(dunn$p.adj[index]),
      stringsAsFactors = FALSE
    )
  })
  list(
    method = "Kruskal-Wallis test with Dunn comparisons",
    independent_n = {
      group_n <- table(data$groupId)
      stats::setNames(as.integer(group_n), names(group_n))
    },
    omnibus = data.frame(
      term = "groupId",
      statistic = unname(omnibus_test$statistic),
      numerator_df = unname(omnibus_test$parameter),
      denominator_df = NA_real_,
      p_value = omnibus_test$p.value,
      stringsAsFactors = FALSE
    ),
    contrasts = do.call(rbind, rows),
    diagnostics = list(
      analysis_unit = "biological replicate",
      scale = "delta Ct ranks",
      confidence_level = confidence_level,
      correction = correction,
      estimate = "pairwise Hodges-Lehmann location shift"
    )
  )
}

selected_welch_statistics <- function(data, selected_comparisons, correction, confidence_level) {
  if (is.null(selected_comparisons) || length(selected_comparisons) == 0) {
    stop("Selected one-way comparisons require at least one numerator/denominator pair")
  }
  groups <- unique(as.character(data$groupId))
  rows <- lapply(selected_comparisons, function(comparison) {
    numerator <- as.character(comparison$numerator)
    denominator <- as.character(comparison$denominator)
    if (length(numerator) != 1 || length(denominator) != 1 ||
        !numerator %in% groups || !denominator %in% groups || identical(numerator, denominator)) {
      stop("Selected comparison contains an unknown or identical group")
    }
    numerator_values <- data$deltaCt[as.character(data$groupId) == numerator]
    denominator_values <- data$deltaCt[as.character(data$groupId) == denominator]
    test <- stats::t.test(
      numerator_values,
      denominator_values,
      var.equal = FALSE,
      conf.level = confidence_level
    )
    estimate <- mean(numerator_values) - mean(denominator_values)
    data.frame(
      target_gene = unique(as.character(data$targetGene)),
      contrast = sprintf("%s - %s", numerator, denominator),
      estimate_delta_ct = estimate,
      ci_low_delta_ct = unname(test$conf.int[1]),
      ci_high_delta_ct = unname(test$conf.int[2]),
      fold_change = 2^(-estimate),
      fold_change_ci_low = 2^(-unname(test$conf.int[2])),
      fold_change_ci_high = 2^(-unname(test$conf.int[1])),
      statistic = unname(test$statistic),
      degrees_freedom = unname(test$parameter),
      p_value = test$p.value,
      stringsAsFactors = FALSE
    )
  })
  contrasts <- do.call(rbind, rows)
  contrasts$p_adjusted <- adjust_pvalues(contrasts$p_value, correction)
  omnibus <- stats::oneway.test(deltaCt ~ groupId, data = data, var.equal = FALSE)
  list(
    method = "Welch t-tests for selected comparisons",
    omnibus = data.frame(
      statistic = unname(omnibus$statistic),
      degrees_freedom_1 = unname(omnibus$parameter[1]),
      degrees_freedom_2 = unname(omnibus$parameter[2]),
      p_value = omnibus$p.value
    ),
    contrasts = contrasts,
    diagnostics = list(
      analysis_unit = "biological replicate",
      scale = "delta Ct",
      confidence_level = confidence_level
    )
  )
}

dunnett_statistics <- function(data, calibrator_group, confidence_level) {
  if (!requireNamespace("multcomp", quietly = TRUE)) {
    stop("Dunnett comparisons require the multcomp package")
  }
  data$groupId <- stats::relevel(factor(data$groupId), ref = calibrator_group)
  model <- stats::aov(deltaCt ~ groupId, data = data)
  fit <- multcomp::glht(model, linfct = multcomp::mcp(groupId = "Dunnett"))
  fit_summary <- summary(fit)
  intervals <- stats::confint(fit, level = confidence_level)$confint
  estimates <- unname(fit_summary$test$coefficients)
  statistics <- unname(fit_summary$test$tstat)
  degrees_freedom <- unname(stats::df.residual(model))
  contrast_names <- names(fit_summary$test$coefficients)
  contrast_names <- sub("groupId", "", contrast_names, fixed = TRUE)
  contrasts <- data.frame(
    target_gene = unique(as.character(data$targetGene)),
    contrast = contrast_names,
    estimate_delta_ct = estimates,
    ci_low_delta_ct = intervals[, "lwr"],
    ci_high_delta_ct = intervals[, "upr"],
    fold_change = 2^(-estimates),
    fold_change_ci_low = 2^(-intervals[, "upr"]),
    fold_change_ci_high = 2^(-intervals[, "lwr"]),
    statistic = statistics,
    degrees_freedom = degrees_freedom,
    p_value = 2 * stats::pt(-abs(statistics), df = degrees_freedom),
    p_adjusted = unname(fit_summary$test$pvalues),
    stringsAsFactors = FALSE
  )
  anova_table <- summary(model)[[1]]
  list(
    method = "One-way ANOVA with Dunnett comparisons",
    independent_n = {
      group_n <- table(data$groupId)
      stats::setNames(as.integer(group_n), names(group_n))
    },
    omnibus = data.frame(
      term = "groupId",
      statistic = unname(anova_table[1, "F value"]),
      numerator_df = unname(anova_table[1, "Df"]),
      denominator_df = unname(anova_table[2, "Df"]),
      p_value = unname(anova_table[1, "Pr(>F)"]),
      stringsAsFactors = FALSE
    ),
    contrasts = contrasts,
    diagnostics = list(
      analysis_unit = "biological replicate",
      scale = "delta Ct",
      confidence_level = confidence_level,
      correction = "Dunnett simultaneous inference"
    )
  )
}

factorial_statistics <- function(data, correction) {
  data$factorA <- factor(data$factorA)
  data$factorB <- factor(data$factorB)
  model <- stats::lm(deltaCt ~ factorA * factorB, data = data)
  anova_table <- stats::anova(model)
  terms <- rownames(anova_table)
  omnibus <- data.frame(
    term = terms,
    degrees_freedom = anova_table$Df,
    statistic = anova_table$`F value`,
    p_value = anova_table$`Pr(>F)`,
    stringsAsFactors = FALSE
  )
  list(
    method = "Two-way linear model with interaction",
    independent_n = length(unique(data$sampleId)),
    omnibus = omnibus,
    contrasts = data.frame(),
    diagnostics = list(
      analysis_unit = "biological replicate",
      scale = "delta Ct",
      formula = "deltaCt ~ factorA * factorB",
      correction = correction
    ),
    model = model
  )
}

repeated_statistics <- function(data, correction) {
  has_lmer_test <- suppressMessages(requireNamespace("lmerTest", quietly = TRUE))
  if (!has_lmer_test) {
    stop("Repeated-measures analysis requires the lmerTest package")
  }
  data$groupId <- factor(data$groupId)
  data$subjectId <- factor(data$subjectId)
  model <- suppressMessages(
    lmerTest::lmer(deltaCt ~ groupId * time + (1 | subjectId), data = data)
  )
  anova_table <- stats::anova(model, type = 3, ddf = "Satterthwaite")
  list(
    method = "Linear mixed model with subject random intercept",
    independent_n = length(unique(data$subjectId)),
    omnibus = data.frame(
      term = rownames(anova_table),
      numerator_df = anova_table$NumDF,
      denominator_df = anova_table$DenDF,
      statistic = anova_table$`F value`,
      p_value = anova_table$`Pr(>F)`,
      stringsAsFactors = FALSE
    ),
    contrasts = data.frame(),
    diagnostics = list(
      analysis_unit = "subject",
      scale = "delta Ct",
      formula = "deltaCt ~ groupId * time + (1 | subjectId)",
      correction = correction,
      singular_fit = lme4::isSingular(model)
    ),
    model = model
  )
}

diagnostic_summary <- function(result, data, design) {
  residual_values <- if (!is.null(result$model)) {
    stats::residuals(result$model)
  } else if (identical(design, "paired_two_group")) {
    groups <- unique(as.character(data$groupId))
    first <- data[data$groupId == groups[1], , drop = FALSE]
    second <- data[data$groupId == groups[2], , drop = FALSE]
    first <- first[order(first$subjectId), , drop = FALSE]
    second <- second[order(second$subjectId), , drop = FALSE]
    differences <- second$deltaCt - first$deltaCt
    differences - mean(differences)
  } else {
    stats::residuals(stats::lm(deltaCt ~ factor(groupId), data = data))
  }
  residual_values <- as.numeric(residual_values[is.finite(residual_values)])
  residual_normality_p <- if (
    length(residual_values) >= 3 && length(residual_values) <= 5000 && stats::sd(residual_values) > 0
  ) {
    unname(stats::shapiro.test(residual_values)$p.value)
  } else {
    NA_real_
  }
  group_counts <- if (identical(design, "repeated_time")) {
    vapply(
      split(as.character(data$subjectId), data$groupId),
      function(subjects) length(unique(subjects)),
      integer(1)
    )
  } else {
    table(data$groupId)
  }
  variance_homogeneity_p <- if (
    length(unique(as.character(data$groupId))) > 1 && all(table(data$groupId) >= 2)
  ) {
    unname(stats::fligner.test(deltaCt ~ factor(groupId), data = data)$p.value)
  } else {
    NA_real_
  }
  residual_sd <- stats::sd(residual_values)
  outlier_count <- if (length(residual_values) > 1 && is.finite(residual_sd) && residual_sd > 0) {
    sum(abs((residual_values - mean(residual_values)) / residual_sd) > 3)
  } else {
    0L
  }
  notes <- character()
  if (min(group_counts) < 3) notes <- c(notes, "At least one analysis group has fewer than three independent units.")
  if (is.finite(residual_normality_p) && residual_normality_p < 0.05) {
    notes <- c(notes, "Residual normality is questionable; inspect the diagnostic plot and consider the declared nonparametric sensitivity analysis.")
  }
  if (is.finite(variance_homogeneity_p) && variance_homogeneity_p < 0.05) {
    notes <- c(notes, "Group variances differ; retain an unequal-variance model or report a robust sensitivity analysis.")
  }
  if (outlier_count > 0) notes <- c(notes, sprintf("%d standardized residual(s) exceed |3|; review source data without automatic exclusion.", outlier_count))
  if (length(notes) == 0) notes <- "No diagnostic flag triggered; graphical residual review remains required."
  list(
    residual_normality_p = residual_normality_p,
    variance_homogeneity_p = variance_homogeneity_p,
    standardized_residual_outlier_count = as.integer(outlier_count),
    minimum_group_n = as.integer(min(group_counts)),
    automatic_switch = FALSE,
    recommendation_note = paste(notes, collapse = " ")
  )
}

attach_diagnostics <- function(result, data, design) {
  result$diagnostics <- c(result$diagnostics, diagnostic_summary(result, data, design))
  result
}

run_statistics <- function(
  data,
  design,
  calibrator_group,
  correction = "holm",
  contrast_mode = "selected",
  method = "recommended",
  selected_comparisons = NULL,
  confidence_level = 0.95
) {
  validate_statistics_input(data, design, calibrator_group)
  if (length(confidence_level) != 1 || !is.finite(confidence_level) || confidence_level <= 0 || confidence_level >= 1) {
    stop("confidence_level must be between 0 and 1")
  }
  genes <- unique(as.character(data$targetGene))
  if (length(genes) != 1) {
    stop("run_statistics accepts one targetGene at a time; combine p values explicitly across genes")
  }
  result <- NULL
  if (design %in% c("independent_two_group", "paired_two_group")) {
    if (method %in% c("nonparametric", "mann_whitney", "wilcoxon")) {
      result <- nonparametric_two_group_statistics(data, design, calibrator_group, correction, confidence_level)
    } else {
      result <- two_group_statistics(data, design, calibrator_group, correction, confidence_level)
    }
  } else if (design == "one_way") {
    if (contrast_mode == "selected") {
      result <- selected_welch_statistics(data, selected_comparisons, correction, confidence_level)
    } else if (method %in% c("nonparametric", "kruskal_wallis")) {
      result <- dunn_statistics(data, calibrator_group, contrast_mode, correction, confidence_level)
    } else if (contrast_mode == "control") {
      result <- dunnett_statistics(data, calibrator_group, confidence_level)
    } else if (method %in% c("equal_variance", "anova")) {
      result <- tukey_statistics(data, confidence_level)
    } else {
      result <- one_way_statistics(data, confidence_level)
    }
  } else if (design == "two_way") {
    result <- factorial_statistics(data, correction)
  } else if (design == "repeated_time") {
    result <- repeated_statistics(data, correction)
  } else {
    stop(sprintf("Statistics execution for %s is not available in this function", design))
  }
  attach_diagnostics(result, data, design)
}
