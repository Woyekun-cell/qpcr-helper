script_arg <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
service_root <- normalizePath(file.path(dirname(sub("^--file=", "", script_arg[1])), ".."))
setwd(service_root)

source(file.path("R", "figures.R"))

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

contrast <- data.frame(
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

dot_plot <- build_expression_plot(samples, plot_type = "dot", title = "Relative expression")
if (!inherits(dot_plot, "ggplot")) stop("Dot plot must be a ggplot object")
layer_geoms <- vapply(dot_plot$layers, function(layer) class(layer$geom)[1], character(1))
if (!"GeomPoint" %in% layer_geoms) stop("Dot plot must expose independent observations")
if (!"GeomErrorbar" %in% layer_geoms) stop("Dot plot must include 95% confidence intervals")
expected_axis <- expression("Relative expression (" * 2^{-Delta * Delta * C[t]} * ")")
if (!identical(dot_plot$labels$y, expected_axis)) stop("Unexpected y-axis label")

paired <- samples
paired$subjectId <- rep(c("subject-1", "subject-2", "subject-3"), 2)
paired_plot <- build_expression_plot(paired, plot_type = "paired")
paired_geoms <- vapply(paired_plot$layers, function(layer) class(layer$geom)[1], character(1))
if (!"GeomLine" %in% paired_geoms) stop("Paired plot must connect matched subjects")

heat_samples <- rbind(samples, transform(samples, targetGene = "GENE2", foldChange = foldChange / 2))
heatmap <- build_expression_plot(heat_samples, plot_type = "heatmap")
heat_geoms <- vapply(heatmap$layers, function(layer) class(layer$geom)[1], character(1))
if (!"GeomTile" %in% heat_geoms) stop("Heatmap must use tiles")

legend <- build_figure_legend(
  samples = samples,
  contrasts = contrast,
  method = "Welch two-sample t-test",
  correction = "Holm"
)
for (required in c("biological replicates", "95% CI", "Welch two-sample t-test", "Holm", "p = 0.00025", "Technical replicates")) {
  if (!grepl(required, legend, fixed = TRUE)) stop(sprintf("Legend missing '%s'", required))
}

output_dir <- tempfile("qpcr-figure-")
dir.create(output_dir)
files <- save_publication_figure(
  dot_plot,
  file.path(output_dir, "relative-expression"),
  width_mm = 90,
  height_mm = 70,
  dpi = 300
)
if (!all(file.exists(unlist(files)))) stop("Figure export did not create every requested format")
if (!all(file.info(unlist(files))$size > 1000)) stop("One or more figure exports are unexpectedly empty")
svg_text <- paste(readLines(files$svg, warn = FALSE), collapse = "\n")
if (!grepl("<text", svg_text, fixed = TRUE)) stop("SVG text must remain editable")

inline_svg <- render_publication_svg(dot_plot, width_mm = 90, height_mm = 70)
if (!grepl("<svg", inline_svg, fixed = TRUE)) stop("Inline preview must be SVG")
if (!grepl("<text", inline_svg, fixed = TRUE)) stop("Inline preview text must remain editable")

cat("figure tests passed\n")
