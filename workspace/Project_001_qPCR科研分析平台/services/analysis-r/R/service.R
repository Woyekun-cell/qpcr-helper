rows_to_data_frame <- function(rows) {
  if (!is.list(rows) || length(rows) == 0) stop("samples must contain at least one row")
  keys <- unique(unlist(lapply(rows, names), use.names = FALSE))
  normalized <- lapply(rows, function(row) {
    missing <- setdiff(keys, names(row))
    row[missing] <- NA
    as.data.frame(row[keys], stringsAsFactors = FALSE)
  })
  data <- do.call(rbind, normalized)
  rownames(data) <- NULL
  if ("deltaCt" %in% names(data)) data$deltaCt <- as.numeric(data$deltaCt)
  if ("time" %in% names(data)) data$time <- as.numeric(data$time)
  data
}

required_config_value <- function(config, name) {
  value <- config[[name]]
  if (is.null(value) || length(value) != 1 || is.na(value) || !nzchar(as.character(value))) {
    stop(sprintf("config.%s is required", name))
  }
  as.character(value)
}

serializable_analysis <- function(result) {
  result$model <- NULL
  result
}

run_analysis_payload <- function(payload) {
  if (!is.list(payload)) stop("request body must be a JSON object")
  if (is.null(payload$config) || !is.list(payload$config)) stop("config is required")
  data <- rows_to_data_frame(payload$samples)
  config <- payload$config
  design <- required_config_value(config, "design")
  calibrator_group <- required_config_value(config, "calibratorGroup")
  correction <- if (is.null(config$correction)) "holm" else as.character(config$correction)
  contrast_mode <- if (is.null(config$contrastMode)) "selected" else as.character(config$contrastMode)
  method <- if (is.null(config$method)) "recommended" else as.character(config$method)

  data$groupId <- factor(
    data$groupId,
    levels = c(calibrator_group, setdiff(unique(as.character(data$groupId)), calibrator_group))
  )
  genes <- unique(as.character(data$targetGene))
  analyses <- lapply(genes, function(gene) {
    gene_data <- data[data$targetGene == gene, , drop = FALSE]
    within_gene_correction <- if (tolower(correction) %in% c("bh", "fdr")) "none" else correction
    serializable_analysis(
      run_statistics(
        gene_data,
        design = design,
        calibrator_group = calibrator_group,
        correction = within_gene_correction,
        contrast_mode = contrast_mode,
        method = method
      )
    )
  })
  names(analyses) <- genes
  contrast_frames <- lapply(analyses, function(analysis) analysis$contrasts)
  contrast_frames <- contrast_frames[vapply(contrast_frames, nrow, integer(1)) > 0]
  contrasts <- if (length(contrast_frames) > 0) do.call(rbind, contrast_frames) else data.frame()
  rownames(contrasts) <- NULL
  if (nrow(contrasts) > 0) {
    contrasts$p_adjusted_family <- if (tolower(correction) %in% c("bh", "fdr")) {
      stats::p.adjust(contrasts$p_value, method = "BH")
    } else {
      contrasts$p_adjusted
    }
  }

  list(
    status = "succeeded",
    analysisUnit = if (design %in% c("paired_two_group", "repeated_time")) "subject" else "biological replicate",
    scale = "delta Ct",
    config = list(
      design = design,
      calibratorGroup = calibrator_group,
      correction = correction,
      contrastMode = contrast_mode,
      method = method
    ),
    analyses = analyses,
    contrasts = contrasts,
    warnings = c(
      "Inference uses biological replicates after technical-replicate aggregation.",
      "Single-reference normalization requires independent reference-gene stability validation."
    )
  )
}

