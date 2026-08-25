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

cran_repo <- Sys.getenv(
  "CRAN_REPO",
  unset = "https://p3m.dev/cran/__linux__/noble/latest"
)
options(repos = c(CRAN = cran_repo))

missing <- packages[!vapply(packages, requireNamespace, logical(1), quietly = TRUE)]
if (length(missing) > 0) {
  install.packages(missing, Ncpus = 4L)
}

if (!requireNamespace("BiocManager", quietly = TRUE)) {
  install.packages("BiocManager")
}
bioconductor_packages <- c("ComplexHeatmap")
missing_bioconductor <- bioconductor_packages[!vapply(bioconductor_packages, requireNamespace, logical(1), quietly = TRUE)]
if (length(missing_bioconductor) > 0) {
  BiocManager::install(missing_bioconductor, ask = FALSE, update = FALSE)
}
