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

write_utf8_lines <- function(text, path) {
  connection <- file(path, open = "w", encoding = "UTF-8")
  on.exit(close(connection), add = TRUE)
  writeLines(text, connection, useBytes = TRUE)
}

methods_text <- function(config, method, locale) {
  if (identical(locale, "zh-CN")) {
    return(paste0(
      "技术重复在推断统计前按样本和基因汇总。目标基因 Ct 减去单个内参基因 Ct 得到 ΔCt；",
      "各样本 ΔCt 减去对照组平均 ΔCt 得到 ΔΔCt，相对表达按 2^-ΔΔCt 计算。",
      "统计以生物学重复为独立单位，在 ΔCt 尺度采用 ", method, "。",
      "比较模式为 ", config$contrastMode, "，多重比较校正为 ", config$correction, "。",
      "效应及 95% CI 反变换至相对表达尺度。图形由 R 生成。"
    ))
  }
  paste0(
    "Technical replicates were aggregated by sample and gene before inference. ",
    "Delta Ct was calculated as target Ct minus the single reference-gene Ct; delta-delta Ct was calculated relative to the calibrator-group mean, and relative expression as 2^-delta-delta Ct. ",
    "Biological replicates were the independent units. Analysis used ", method, " on the delta Ct scale. ",
    "The comparison mode was ", config$contrastMode, " with ", config$correction, " multiplicity correction. ",
    "Effects and 95% confidence intervals were back-transformed to relative-expression units. Figures were generated in R."
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
  plot_type = "dot",
  width_mm = 90,
  height_mm = 70,
  dpi = 300,
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
  utils::write.csv(
    sanitize_spreadsheet_frame(raw_wells),
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

  workbook <- openxlsx::createWorkbook()
  sheets <- list(
    Contrasts = analysis$contrasts,
    Omnibus = analysis$omnibus,
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

  plot <- build_expression_plot(samples, plot_type = plot_type)
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
    config$correction
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
    sprintf("plot <- build_expression_plot(samples, plot_type = \"%s\")", plot_type),
    sprintf(
      "save_publication_figure(plot, \"figure-reproduced\", width_mm = %s, height_mm = %s, dpi = %s)",
      width_mm,
      height_mm,
      dpi
    )
  )
  write_utf8_lines(reproduce_script, file.path(bundle_directory, "reproduce.R"))

  files_before_manifest <- list.files(bundle_directory, full.names = TRUE)
  manifest_files <- data.frame(
    file = basename(files_before_manifest),
    bytes = unname(file.info(files_before_manifest)$size),
    md5 = unname(tools::md5sum(files_before_manifest)),
    stringsAsFactors = FALSE
  )
  manifest <- list(
    schemaVersion = "1.0",
    createdAt = format(Sys.time(), tz = "UTC", usetz = TRUE),
    backend = "R",
    files = manifest_files
  )
  jsonlite::write_json(
    manifest,
    file.path(bundle_directory, "manifest.json"),
    dataframe = "rows",
    pretty = TRUE,
    auto_unbox = TRUE
  )

  zip_path <- file.path(destination, "qpcr-research-export.zip")
  if (file.exists(zip_path)) unlink(zip_path)
  zip::zipr(zip_path, list.files(bundle_directory, full.names = TRUE), root = bundle_directory)
  list(directory = bundle_directory, zip = zip_path, manifest = manifest)
}

