script_arg <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
service_root <- normalizePath(file.path(dirname(sub("^--file=", "", script_arg[1])), ".."))
setwd(service_root)
source(file.path("R", "figures.R"))

samples <- data.frame(
  sampleId = c("C1", "C2", "C3", "T1", "T2", "T3"),
  groupId = c("Control", "Control", "Control", "Treatment", "Treatment", "Treatment"),
  targetGene = "GENE1",
  foldChange = 2^-c(0, 0.2, -0.2, -3, -2.9, -3.1),
  stringsAsFactors = FALSE
)
output <- file.path("artifacts", "qa")
dir.create(output, recursive = TRUE, showWarnings = FALSE)
plot <- build_expression_plot(samples, plot_type = "dot", title = "GENE1 expression")
paths <- save_publication_figure(plot, file.path(output, "relative-expression"), 90, 70, 300)
cat(paste(unlist(paths), collapse = "\n"), "\n")
