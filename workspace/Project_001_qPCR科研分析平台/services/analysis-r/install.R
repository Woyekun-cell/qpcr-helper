packages <- c(
  "plumber",
  "jsonlite",
  "ggplot2",
  "patchwork",
  "svglite",
  "ragg",
  "openxlsx",
  "emmeans",
  "multcomp",
  "lme4",
  "lmerTest",
  "rstatix",
  "zip",
  "digest"
)

missing <- packages[!vapply(packages, requireNamespace, logical(1), quietly = TRUE)]
if (length(missing) > 0) {
  install.packages(missing, repos = "https://cloud.r-project.org", Ncpus = 2L)
}
