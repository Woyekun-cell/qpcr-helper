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

payload_frame <- function(value) {
  if (is.null(value) || length(value) == 0) return(data.frame())
  if (is.data.frame(value)) return(value)
  rows <- lapply(value, function(row) {
    if (is.data.frame(row)) as.list(row[1, , drop = FALSE]) else row
  })
  rows_to_data_frame(rows)
}

derive_fold_change <- function(samples, calibrator_group) {
  if ("foldChange" %in% names(samples)) return(samples)
  samples$deltaDeltaCt <- NA_real_
  samples$foldChange <- NA_real_
  for (gene in unique(as.character(samples$targetGene))) {
    gene_rows <- samples$targetGene == gene
    calibrator_rows <- gene_rows & as.character(samples$groupId) == calibrator_group
    if (!any(calibrator_rows)) stop(sprintf("Unknown calibrator group: %s", calibrator_group))
    baseline <- mean(samples$deltaCt[calibrator_rows])
    samples$deltaDeltaCt[gene_rows] <- samples$deltaCt[gene_rows] - baseline
    samples$foldChange[gene_rows] <- 2^(-samples$deltaDeltaCt[gene_rows])
  }
  samples
}

run_preview_payload <- function(payload) {
  if (!is.list(payload)) stop("request body must be a JSON object")
  config <- payload$config
  if (is.null(config) || !is.list(config)) stop("config is required")
  samples <- derive_fold_change(
    payload_frame(payload$samples),
    required_config_value(config, "calibratorGroup")
  )
  figure <- if (is.null(payload$figure)) list() else payload$figure
  plot_type <- if (is.null(figure$plotType)) "dot" else as.character(figure$plotType)
  width_mm <- if (is.null(figure$widthMm)) 90 else as.numeric(figure$widthMm)
  height_mm <- if (is.null(figure$heightMm)) 70 else as.numeric(figure$heightMm)
  plot <- build_expression_plot(
    samples,
    plot_type = plot_type,
    title = if (is.null(payload$title)) NULL else as.character(payload$title)
  )
  list(
    status = "succeeded",
    backend = "R/ggplot2",
    plotType = plot_type,
    widthMm = width_mm,
    heightMm = height_mm,
    svg = render_publication_svg(plot, width_mm = width_mm, height_mm = height_mm)
  )
}

run_export_payload <- function(payload, destination = tempfile("qpcr-export-")) {
  if (!is.list(payload)) stop("request body must be a JSON object")
  config <- payload$config
  if (is.null(config) || !is.list(config)) stop("config is required")
  calibrator_group <- required_config_value(config, "calibratorGroup")
  raw_wells <- payload_frame(payload$rawWells)
  samples <- derive_fold_change(payload_frame(payload$samples), calibrator_group)
  if (!"biologicalReplicateId" %in% names(samples)) {
    samples$biologicalReplicateId <- samples$sampleId
  }
  qc <- payload_frame(payload$qc)
  analysis <- payload$analysis
  if (is.null(analysis) || !is.list(analysis)) stop("analysis is required")
  analysis$contrasts <- payload_frame(analysis$contrasts)
  analysis$omnibus <- payload_frame(analysis$omnibus)
  figure <- if (is.null(payload$figure)) list() else payload$figure
  dir.create(destination, recursive = TRUE, showWarnings = FALSE)
  create_research_export(
    destination = destination,
    project_name = if (is.null(payload$projectName)) "qPCR analysis" else as.character(payload$projectName),
    raw_wells = raw_wells,
    samples = samples,
    qc = qc,
    analysis = analysis,
    config = config,
    plot_type = if (is.null(figure$plotType)) "dot" else as.character(figure$plotType),
    width_mm = if (is.null(figure$widthMm)) 90 else as.numeric(figure$widthMm),
    height_mm = if (is.null(figure$heightMm)) 70 else as.numeric(figure$heightMm),
    dpi = if (is.null(figure$dpi)) 300 else as.numeric(figure$dpi),
    locale = if (is.null(payload$locale)) "en" else as.character(payload$locale)
  )
}
