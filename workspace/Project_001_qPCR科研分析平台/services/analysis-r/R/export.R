sanitize_spreadsheet_value <- function(value) {
  if (is.na(value)) return(value)
  text <- as.character(value)
  if (grepl("^[=+@-]", text)) paste0("'", text) else text
}

sanitize_spreadsheet_frame <- function(data) {
  safe <- data
  character_columns <- vapply(safe, function(column) is.character(column) || is.factor(column), logical(1))
  safe[character_columns] <- lapply(
    safe[character_columns],
    function(column) vapply(as.character(column), sanitize_spreadsheet_value, character(1))
  )
  safe
}

export_column <- function(data, candidates) {
  name <- candidates[candidates %in% names(data)][1]
  if (is.na(name)) return(rep(NA_character_, nrow(data)))
  data[[name]]
}

standardize_raw_wells <- function(raw_wells) {
  data.frame(
    well_id = export_column(raw_wells, c("well_id", "wellId")),
    sample_id = export_column(raw_wells, c("sample_id", "sampleId")),
    biological_replicate = export_column(raw_wells, c("biological_replicate", "biologicalReplicateId")),
    technical_replicate = export_column(raw_wells, c("technical_replicate", "technicalReplicateId")),
    group = export_column(raw_wells, c("group", "groupId")),
    gene = export_column(raw_wells, "gene"),
    role = export_column(raw_wells, c("role", "geneRole")),
    ct = export_column(raw_wells, "ct"),
    status = export_column(raw_wells, "status"),
    subject_id = export_column(raw_wells, c("subject_id", "subjectId")),
    factor_a = export_column(raw_wells, c("factor_a", "factorA")),
    factor_b = export_column(raw_wells, c("factor_b", "factorB")),
    time = export_column(raw_wells, "time"),
    plate_id = export_column(raw_wells, c("plate_id", "plateId")),
    batch = export_column(raw_wells, "batch"),
    check.names = FALSE,
    stringsAsFactors = FALSE
  )
}

standardize_qc_decisions <- function(qc) {
  decisions <- data.frame(
    well_id = export_column(qc, c("well_id", "wellId")),
    decision = export_column(qc, "decision"),
    reason = export_column(qc, "reason"),
    operator = export_column(qc, "operator"),
    decided_at = export_column(qc, c("decided_at", "decidedAt")),
    check.names = FALSE,
    stringsAsFactors = FALSE
  )
  keep <- !is.na(decisions$well_id) & nzchar(trimws(as.character(decisions$well_id))) &
    !is.na(decisions$decision) & nzchar(trimws(as.character(decisions$decision)))
  decisions[keep, , drop = FALSE]
}

write_utf8_lines <- function(text, path) {
  connection <- file(path, open = "w", encoding = "UTF-8")
  on.exit(close(connection), add = TRUE)
  writeLines(text, connection, useBytes = TRUE)
}

methods_text <- function(config, method, locale) {
  confidence_level <- if (is.null(config$confidenceLevel)) 0.95 else as.numeric(config$confidenceLevel)
  confidence_label <- format(100 * confidence_level, trim = TRUE, scientific = FALSE)
  alpha <- if (is.null(config$alpha)) 0.05 else as.numeric(config$alpha)
  if (identical(locale, "zh-CN")) {
    return(paste0(
      "技术重复在推断统计前按样本和基因汇总。目标基因 Ct 减去单个内参基因 Ct 得到 ΔCt；",
      "各样本 ΔCt 减去对照组平均 ΔCt 得到 ΔΔCt，相对表达按 2^-ΔΔCt 计算。",
      "统计以生物学重复为独立单位，在 ΔCt 尺度采用 ", method, "。",
      "比较模式为 ", config$contrastMode, "，多重比较校正为 ", config$correction, "。",
      "显著性水平 α = ", alpha, "。",
      "效应及 ", confidence_label, "% CI 反变换至相对表达尺度。图形由 R 生成。"
    ))
  }
  paste0(
    "Technical replicates were aggregated by sample and gene before inference. ",
    "Delta Ct was calculated as target Ct minus the single reference-gene Ct; delta-delta Ct was calculated relative to the calibrator-group mean, and relative expression as 2^-delta-delta Ct. ",
    "Biological replicates were the independent units. Analysis used ", method, " on the delta Ct scale. ",
    "The comparison mode was ", config$contrastMode, " with ", config$correction, " multiplicity correction. ",
    "The significance threshold was alpha = ", alpha, ". ",
    "Effects and ", confidence_label, "% confidence intervals were back-transformed to relative-expression units. Figures were generated in R."
  )
}

create_research_export <- function(
  destination,
  project_name,
  raw_wells,
  samples,
  qc,
  analysis,
  config,
  plot_type = "bar",
  width_mm = 90,
  height_mm = 70,
  dpi = 300,
  palette_name = "nature-muted",
  p_label_mode = "stars",
  show_points = TRUE,
  point_shape = "circle",
  custom_colors = NULL,
  locale = "en"
) {
  required_packages <- c("jsonlite", "openxlsx", "zip")
  missing <- required_packages[!vapply(required_packages, requireNamespace, logical(1), quietly = TRUE)]
  if (length(missing) > 0) stop(sprintf("Research export requires: %s", paste(missing, collapse = ", ")))
  dir.create(destination, recursive = TRUE, showWarnings = FALSE)
  bundle_directory <- file.path(destination, "research-export")
  if (dir.exists(bundle_directory)) unlink(bundle_directory, recursive = TRUE, force = TRUE)
  dir.create(bundle_directory, recursive = TRUE)

  jsonlite::write_json(
    raw_wells,
    file.path(bundle_directory, "raw_input.json"),
    dataframe = "columns",
    pretty = TRUE,
    auto_unbox = TRUE,
    na = "null"
  )
  portable_wells <- standardize_raw_wells(raw_wells)
  portable_qc <- standardize_qc_decisions(qc)
  utils::write.csv(
    sanitize_spreadsheet_frame(portable_wells),
    file.path(bundle_directory, "raw_wells_safe.csv"),
    row.names = FALSE,
    na = ""
  )
  utils::write.csv(
    sanitize_spreadsheet_frame(samples),
    file.path(bundle_directory, "clean_samples.csv"),
    row.names = FALSE,
    na = ""
  )
  utils::write.csv(
    sanitize_spreadsheet_frame(qc),
    file.path(bundle_directory, "qc_log.csv"),
    row.names = FALSE,
    na = ""
  )
  utils::write.csv(
    sanitize_spreadsheet_frame(analysis$contrasts),
    file.path(bundle_directory, "contrasts.csv"),
    row.names = FALSE,
    na = ""
  )

  roundtrip_workbook <- openxlsx::createWorkbook()
  openxlsx::addWorksheet(roundtrip_workbook, "Ct_Data")
  openxlsx::writeData(roundtrip_workbook, "Ct_Data", sanitize_spreadsheet_frame(portable_wells))
  openxlsx::freezePane(roundtrip_workbook, "Ct_Data", firstRow = TRUE)
  openxlsx::addWorksheet(roundtrip_workbook, "QC_Decisions")
  openxlsx::writeData(roundtrip_workbook, "QC_Decisions", sanitize_spreadsheet_frame(portable_qc))
  openxlsx::freezePane(roundtrip_workbook, "QC_Decisions", firstRow = TRUE)
  openxlsx::saveWorkbook(
    roundtrip_workbook,
    file.path(bundle_directory, "qpcr_roundtrip.xlsx"),
    overwrite = TRUE
  )

  workbook <- openxlsx::createWorkbook()
  sheets <- list(
    Contrasts = analysis$contrasts,
    Omnibus = analysis$omnibus,
    Diagnostics = if (is.null(analysis$diagnostics)) data.frame() else analysis$diagnostics,
    Samples = samples,
    QC = qc
  )
  for (sheet_name in names(sheets)) {
    openxlsx::addWorksheet(workbook, sheet_name)
    openxlsx::writeData(workbook, sheet_name, sanitize_spreadsheet_frame(sheets[[sheet_name]]))
    openxlsx::freezePane(workbook, sheet_name, firstRow = TRUE)
  }
  openxlsx::saveWorkbook(
    workbook,
    file.path(bundle_directory, "statistics.xlsx"),
    overwrite = TRUE
  )

  confidence_level <- if (is.null(config$confidenceLevel)) 0.95 else as.numeric(config$confidenceLevel)
  plot <- build_expression_plot(
    samples,
    plot_type = plot_type,
    confidence_level = confidence_level,
    contrasts = analysis$contrasts,
    palette_name = palette_name,
    p_label_mode = p_label_mode,
    show_points = show_points,
    custom_colors = custom_colors,
    point_shape = point_shape
  )
  save_publication_figure(
    plot,
    file.path(bundle_directory, "figure"),
    width_mm = width_mm,
    height_mm = height_mm,
    dpi = dpi
  )

  legend <- build_figure_legend(
    samples,
    analysis$contrasts,
    analysis$method,
    config$correction,
    confidence_level
  )
  write_utf8_lines(legend, file.path(bundle_directory, "figure_legend.txt"))
  write_utf8_lines(
    methods_text(config, analysis$method, locale),
    file.path(bundle_directory, "methods.txt")
  )
  parameters <- list(
    projectName = project_name,
    locale = locale,
    analysis = config,
    figure = list(
      plotType = plot_type,
      widthMm = width_mm,
      heightMm = height_mm,
      dpi = dpi,
      palette = palette_name,
      pLabelMode = p_label_mode,
      showPoints = show_points,
      pointShape = point_shape,
      customColors = custom_colors,
      backend = "R"
    )
  )
  jsonlite::write_json(
    parameters,
    file.path(bundle_directory, "parameters.json"),
    pretty = TRUE,
    auto_unbox = TRUE,
    na = "null"
  )
  write_utf8_lines(
    capture.output(utils::sessionInfo()),
    file.path(bundle_directory, "sessionInfo.txt")
  )
  file.copy(
    file.path("R", "figures.R"),
    file.path(bundle_directory, "figure_functions.R"),
    overwrite = TRUE
  )
  reproduce_script <- c(
    "source(\"figure_functions.R\")",
    "samples <- read.csv(\"clean_samples.csv\", stringsAsFactors = FALSE)",
    sprintf(
      "plot <- build_expression_plot(samples, plot_type = \"%s\", confidence_level = %s, contrasts = read.csv(\"contrasts.csv\", stringsAsFactors = FALSE), palette_name = \"%s\", p_label_mode = \"%s\", show_points = %s, point_shape = \"%s\", custom_colors = %s)",
      plot_type,
      confidence_level,
      palette_name,
      p_label_mode,
      if (show_points) "TRUE" else "FALSE",
      point_shape,
      if (is.null(custom_colors)) "NULL" else sprintf("c(%s)", paste(sprintf("\"%s\"", custom_colors), collapse = ", "))
    ),
    sprintf(
      "save_publication_figure(plot, \"figure-reproduced\", width_mm = %s, height_mm = %s, dpi = %s)",
      width_mm,
      height_mm,
      dpi
    )
  )
  write_utf8_lines(reproduce_script, file.path(bundle_directory, "reproduce.R"))

  files_before_manifest <- list.files(bundle_directory, full.names = TRUE)
  if (!requireNamespace("digest", quietly = TRUE)) stop("Export manifest requires digest")
  manifest_files <- data.frame(
    path = basename(files_before_manifest),
    bytes = unname(file.info(files_before_manifest)$size),
    sha256 = vapply(
      files_before_manifest,
      function(path) digest::digest(path, algo = "sha256", file = TRUE),
      character(1)
    ),
    stringsAsFactors = FALSE
  )
  manifest <- list(
    schemaVersion = "1.0",
    createdAt = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"),
    appVersion = Sys.getenv("APP_VERSION", unset = "0.1.0"),
    rVersion = R.version.string,
    backend = "R",
    parameters = parameters,
    files = manifest_files
  )
  jsonlite::write_json(
    manifest,
    file.path(bundle_directory, "manifest.json"),
    dataframe = "rows",
    pretty = TRUE,
    auto_unbox = TRUE
  )

  zip_path <- file.path(destination, "qpcr-helper-research-export.zip")
  if (file.exists(zip_path)) unlink(zip_path)
  zip::zipr(zip_path, list.files(bundle_directory, full.names = TRUE), root = bundle_directory)
  list(directory = bundle_directory, zip = zip_path, manifest = manifest)
}
