script_arg <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
service_root <- normalizePath(file.path(dirname(sub("^--file=", "", script_arg[1])), ".."))
setwd(service_root)

source(file.path("R", "figures.R"))

for (family in c("journal", "morandi", "macaron", "accessible", "gradient")) {
  if (length(qpcr_palette_families[[family]]) != 8) {
    stop(sprintf("Palette family %s must expose exactly eight presets", family))
  }
}

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
interval_95 <- group_interval(samples, "groupId", confidence_level = 0.95)
interval_90 <- group_interval(samples, "groupId", confidence_level = 0.90)
if (!all((interval_90$ci_high - interval_90$ci_low) < (interval_95$ci_high - interval_95$ci_low))) {
  stop("Figure confidence intervals did not honor the configured confidence level")
}
expected_axis <- "Relative expression"
if (!identical(dot_plot$labels$y, expected_axis)) stop("Figure y-axis must use a concise relative-expression label")
x_scale <- dot_plot$scales$get_scales("x")
if (is.null(x_scale) || any(grepl("n =", unname(x_scale$labels), fixed = TRUE))) {
  stop("Figure x-axis must not repeat biological n")
}

bar_plot <- build_expression_plot(
  samples,
  plot_type = "bar",
  contrasts = contrast,
  palette_name = "okabe-ito",
  p_label_mode = "stars"
)
bar_geoms <- vapply(bar_plot$layers, function(layer) class(layer$geom)[1], character(1))
if (!"GeomCol" %in% bar_geoms) stop("Bar plot must include summary bars")
if (!"GeomErrorbar" %in% bar_geoms) stop("Bar plot must include confidence intervals")
if (!all(c("GeomSegment", "GeomText") %in% bar_geoms)) stop("Bar plot must include significance brackets and labels")
point_layer <- bar_plot$layers[[which(bar_geoms == "GeomPoint")[1]]]
if (!identical(point_layer$aes_params$shape, 21)) stop("Independent points must use a filled shape with a visible outline")
if (!identical(point_layer$aes_params$size, 1.5)) stop("Independent points must use the standard configurable size")
error_layer <- bar_plot$layers[[which(bar_geoms == "GeomErrorbar")[1]]]
if (error_layer$aes_params$linewidth > 0.32) stop("Error bars must use a fine publication-weight line")
text_layers <- bar_plot$layers[bar_geoms == "GeomText"]
if (!any(vapply(text_layers, function(layer) "***" %in% layer$data$label, logical(1)))) {
  stop("Adjusted p < 0.001 must render as three significance stars")
}

square_plot <- build_expression_plot(samples, plot_type = "bar", point_shape = "square")
square_geoms <- vapply(square_plot$layers, function(layer) class(layer$geom)[1], character(1))
square_points <- square_plot$layers[[which(square_geoms == "GeomPoint")[1]]]
if (!identical(square_points$aes_params$shape, 22)) stop("Square point selection must reach the R layer")

for (plot_kind in c("dot", "violin_box")) {
  annotated_plot <- build_expression_plot(samples, plot_type = plot_kind, contrasts = contrast)
  annotated_geoms <- vapply(annotated_plot$layers, function(layer) class(layer$geom)[1], character(1))
  if (!all(c("GeomSegment", "GeomText") %in% annotated_geoms)) {
    stop(sprintf("%s plot must display significance annotations", plot_kind))
  }
}

violin_box_plot <- build_expression_plot(samples, plot_type = "violin_box", point_size = 2.2)
violin_box_geoms <- vapply(violin_box_plot$layers, function(layer) class(layer$geom)[1], character(1))
if (!all(c("GeomViolin", "GeomBoxplot") %in% violin_box_geoms)) stop("Violin-box plots must overlay both distributions and quartiles")
violin_box_points <- violin_box_plot$layers[[which(violin_box_geoms == "GeomPoint")[1]]]
if (!identical(violin_box_points$aes_params$size, 2.2)) stop("Configured point size must reach the R plot layer")

paired <- samples
paired$subjectId <- rep(c("subject-1", "subject-2", "subject-3"), 2)
paired_plot <- build_expression_plot(paired, plot_type = "paired")
paired_geoms <- vapply(paired_plot$layers, function(layer) class(layer$geom)[1], character(1))
if (!"GeomLine" %in% paired_geoms) stop("Paired plot must connect matched subjects")

heat_samples <- rbind(samples, transform(samples, targetGene = "GENE2", foldChange = foldChange / 2))
heatmap <- build_expression_plot(heat_samples, plot_type = "heatmap")
if (!inherits(heatmap, "Heatmap")) stop("Heatmap must be generated by ComplexHeatmap")
if (!identical(heatmap@matrix_param$gp$col, "black")) stop("Heatmap cells must have black outlines")
if (!identical(as.numeric(heatmap@matrix_param$width), as.numeric(heatmap@matrix_param$height))) {
  stop("Heatmap cell geometry must remain square for this square matrix")
}
rectangular_samples <- rbind(heat_samples, transform(samples, targetGene = "GENE3", foldChange = foldChange * 1.5))
rectangular_heatmap <- build_expression_plot(rectangular_samples, plot_type = "heatmap")
if (grid::unitType(rectangular_heatmap@matrix_param$width) != "mm" || grid::unitType(rectangular_heatmap@matrix_param$height) != "mm") {
  stop("Heatmap cells must use fixed physical dimensions")
}
if (!isTRUE(all.equal(
  as.numeric(rectangular_heatmap@matrix_param$width) / ncol(rectangular_heatmap@matrix),
  as.numeric(rectangular_heatmap@matrix_param$height) / nrow(rectangular_heatmap@matrix)
))) stop("Rectangular heatmaps must retain square cells")
morandi_heatmap <- build_expression_plot(heat_samples, plot_type = "heatmap", palette_name = "morandi-sage")
macaron_heatmap <- build_expression_plot(heat_samples, plot_type = "heatmap", palette_name = "macaron-gelato")
if (identical(morandi_heatmap@matrix_color_mapping@colors, macaron_heatmap@matrix_color_mapping@colors)) {
  stop("Heatmap colors must follow the selected palette")
}
custom_plot <- build_expression_plot(samples, plot_type = "bar", palette_name = "custom", custom_colors = c("#112233", "#DDEEFF"))
custom_scale <- custom_plot$scales$get_scales("fill")
if (!all(c("#112233", "#DDEEFF") %in% unname(custom_scale$palette(2)))) stop("Custom group colors must reach the plot scale")
multi_gene_dot <- build_expression_plot(heat_samples, plot_type = "dot")
if (!inherits(multi_gene_dot$facet, "FacetWrap")) stop("Multi-gene dot plots must facet by target gene")
if (!identical(multi_gene_dot$theme$strip.text$face, "italic")) stop("Faceted gene names must be italic")
if (!identical(unname(heatmap@row_names_param$gp$font), 3L)) stop("Heatmap gene names must be italic")

multi_gene_bar <- build_expression_plot(heat_samples, plot_type = "bar", palette_name = "custom", custom_colors = c("#264653", "#E76F51"))
multi_gene_bar_scale <- multi_gene_bar$scales$get_scales("fill")
multi_gene_bar_colors <- multi_gene_bar_scale$palette(4)
if (length(unique(multi_gene_bar_colors)) != 4) stop("Multi-gene bars must receive a non-repeating graduated color per displayed series")
if (!identical(unname(toupper(multi_gene_bar_colors)), c("#264653", "#665352", "#A66151", "#E76F51"))) {
  stop("Multi-gene bar colors must progress continuously from the first stop to the last")
}

gradient_heatmap <- build_expression_plot(heat_samples, plot_type = "heatmap", palette_name = "gradient-blue-red")
gradient_colors <- toupper(gradient_heatmap@matrix_color_mapping@colors)
if (!any(grepl("#FFFFFF", gradient_colors, fixed = TRUE))) stop("Diverging gradients must have a white midpoint")

continuous_heatmap <- build_expression_plot(heat_samples, plot_type = "heatmap", palette_name = "gradient-sunset-multi")
continuous_colors <- toupper(continuous_heatmap@matrix_color_mapping@colors)
if (any(grepl("#FFFFFF", continuous_colors, fixed = TRUE))) stop("Continuous multi-stop gradients must not force a white midpoint")

legend <- build_figure_legend(
  samples = samples,
  contrasts = contrast,
  method = "Welch two-sample t-test",
  correction = "Holm"
)
for (required in c("biological replicates", "95% CI", "Welch two-sample t-test", "Holm", "p = 0.00025", "Technical replicates")) {
  if (!grepl(required, legend, fixed = TRUE)) stop(sprintf("Legend missing '%s'", required))
}
multi_gene_legend <- build_figure_legend(
  samples = heat_samples,
  contrasts = contrast,
  method = "Welch two-sample t-test",
  correction = "Holm"
)
if (grepl("control 6", multi_gene_legend, fixed = TRUE)) stop("Biological n must not be multiplied by the number of genes")

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

single_png <- tempfile("qpcr-single-", fileext = ".png")
save_publication_format(dot_plot, single_png, format = "png", width_mm = 75, height_mm = 60, dpi = 600)
if (!file.exists(single_png) || file.info(single_png)$size <= 1000) stop("Direct PNG export must create a non-empty file")
invalid_format <- tryCatch({
  save_publication_format(dot_plot, tempfile(), format = "jpg")
  NA_character_
}, error = function(error) conditionMessage(error))
if (!identical(invalid_format, "Unsupported figure format: jpg")) stop("Direct export must reject unsupported formats")

cat("figure tests passed\n")
