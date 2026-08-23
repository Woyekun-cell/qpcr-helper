script_arg <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
service_root <- normalizePath(file.path(dirname(sub("^--file=", "", script_arg[1])), ".."))
setwd(service_root)
source(file.path("R", "figures.R"))

samples <- data.frame(
  sampleId = c("C1", "C2", "C3", "T1", "T2", "T3"),
  biologicalReplicateId = c("C1", "C2", "C3", "T1", "T2", "T3"),
  groupId = c("Control", "Control", "Control", "Treatment", "Treatment", "Treatment"),
  targetGene = "GENE1",
  foldChange = 2^-c(0, 0.2, -0.2, -3, -2.9, -3.1),
  stringsAsFactors = FALSE
)
contrasts <- data.frame(
  target_gene = "GENE1",
  contrast = "Treatment - Control",
  p_value = 0.00025,
  p_adjusted = 0.00025,
  p_adjusted_family = 0.00025,
  stringsAsFactors = FALSE
)
output <- file.path("artifacts", "qa")
dir.create(output, recursive = TRUE, showWarnings = FALSE)
bar_plot <- build_expression_plot(samples, plot_type = "bar", contrasts = contrasts, palette_name = "okabe-ito")
bar_paths <- save_publication_figure(bar_plot, file.path(output, "bar-points-ci"), 90, 70, 300)
heat_samples <- rbind(samples, transform(samples, targetGene = "GENE2", foldChange = foldChange / 2))
heat_plot <- build_expression_plot(heat_samples, plot_type = "heatmap")
heat_paths <- save_publication_figure(heat_plot, file.path(output, "complex-heatmap"), 90, 70, 300)
cat(paste(c(unlist(bar_paths), unlist(heat_paths)), collapse = "\n"), "\n")
