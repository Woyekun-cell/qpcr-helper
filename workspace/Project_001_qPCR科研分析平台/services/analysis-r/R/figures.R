qpcr_palette <- c(
  "#536B3F",
  "#D78368",
  "#405A78",
  "#4B8D88",
  "#7E6A9C",
  "#B88A3B",
  "#6B6B6B"
)

theme_qpcr_nature <- function(base_size = 6.5, base_family = "Helvetica") {
  if (!requireNamespace("ggplot2", quietly = TRUE)) stop("Figures require ggplot2")
  ggplot2::theme_classic(base_size = base_size, base_family = base_family) +
    ggplot2::theme(
      axis.line = ggplot2::element_line(linewidth = 0.35, colour = "#1E211D"),
      axis.ticks = ggplot2::element_line(linewidth = 0.35, colour = "#1E211D"),
      axis.title = ggplot2::element_text(size = base_size),
      axis.text = ggplot2::element_text(size = base_size - 0.5, colour = "#1E211D"),
      legend.title = ggplot2::element_text(size = base_size - 0.3),
      legend.text = ggplot2::element_text(size = base_size - 0.7),
      legend.position = "none",
      strip.background = ggplot2::element_blank(),
      strip.text = ggplot2::element_text(size = base_size, face = "bold"),
      plot.title = ggplot2::element_text(size = base_size + 0.5, face = "bold", margin = ggplot2::margin(b = 4)),
      panel.grid = ggplot2::element_blank(),
      plot.margin = ggplot2::margin(5, 6, 5, 5)
    )
}

validate_figure_samples <- function(samples, plot_type) {
  required <- c("sampleId", "groupId", "targetGene", "foldChange")
  missing <- setdiff(required, names(samples))
  if (length(missing) > 0) stop(sprintf("Figure data is missing: %s", paste(missing, collapse = ", ")))
  if (any(!is.finite(samples$foldChange) | samples$foldChange <= 0)) {
    stop("foldChange must contain finite positive values for log-scale plotting")
  }
  if (plot_type == "paired" && !"subjectId" %in% names(samples)) {
    stop("Paired plots require subjectId")
  }
  if (plot_type == "time" && !all(c("subjectId", "time") %in% names(samples))) {
    stop("Time plots require subjectId and time")
  }
}

group_interval <- function(samples, group_columns) {
  samples$log2_fold <- log2(samples$foldChange)
  split_key <- interaction(samples[group_columns], drop = TRUE, lex.order = TRUE)
  pieces <- split(samples, split_key)
  rows <- lapply(pieces, function(piece) {
    center <- mean(piece$log2_fold)
    n <- nrow(piece)
    margin <- if (n > 1) stats::qt(0.975, df = n - 1) * stats::sd(piece$log2_fold) / sqrt(n) else NA_real_
    values <- as.list(piece[1, group_columns, drop = FALSE])
    c(
      values,
      list(
        biological_n = n,
        center = 2^center,
        ci_low = if (is.na(margin)) NA_real_ else 2^(center - margin),
        ci_high = if (is.na(margin)) NA_real_ else 2^(center + margin)
      )
    )
  })
  result <- do.call(rbind.data.frame, c(rows, list(stringsAsFactors = FALSE)))
  numeric_columns <- c("biological_n", "center", "ci_low", "ci_high")
  result[numeric_columns] <- lapply(result[numeric_columns], as.numeric)
  result
}

group_colors <- function(samples) {
  groups <- if (is.factor(samples$groupId)) levels(droplevels(samples$groupId)) else unique(as.character(samples$groupId))
  stats::setNames(rep(qpcr_palette, length.out = length(groups)), groups)
}

build_expression_plot <- function(
  samples,
  plot_type = c("dot", "box", "violin", "paired", "time", "heatmap"),
  title = NULL
) {
  if (!requireNamespace("ggplot2", quietly = TRUE)) stop("Figures require ggplot2")
  plot_type <- match.arg(plot_type)
  validate_figure_samples(samples, plot_type)
  samples$groupId <- factor(samples$groupId, levels = unique(as.character(samples$groupId)))
  colors <- group_colors(samples)
  title <- title %||% ""

  if (plot_type == "heatmap") {
    samples$log2_fold <- log2(samples$foldChange)
    aggregate_data <- stats::aggregate(log2_fold ~ targetGene + groupId, data = samples, FUN = mean)
    return(
      ggplot2::ggplot(aggregate_data, ggplot2::aes(x = groupId, y = targetGene, fill = log2_fold)) +
        ggplot2::geom_tile(colour = "white", linewidth = 0.35) +
        ggplot2::scale_fill_gradient2(
          low = "#405A78",
          mid = "#F7F4ED",
          high = "#B65F4D",
          midpoint = 0,
          name = "log2 fold change"
        ) +
        ggplot2::labs(x = NULL, y = NULL, title = title) +
        theme_qpcr_nature() +
        ggplot2::theme(
          legend.position = "right",
          axis.line = ggplot2::element_blank(),
          axis.ticks = ggplot2::element_blank()
        )
    )
  }

  if (plot_type == "time") {
    summary_data <- group_interval(samples, c("groupId", "time"))
    return(
      ggplot2::ggplot(samples, ggplot2::aes(x = time, y = foldChange, colour = groupId)) +
        ggplot2::geom_line(ggplot2::aes(group = subjectId), linewidth = 0.3, alpha = 0.25) +
        ggplot2::geom_point(size = 1.3, alpha = 0.7) +
        ggplot2::geom_line(
          data = summary_data,
          ggplot2::aes(x = time, y = center, group = groupId),
          linewidth = 0.8
        ) +
        ggplot2::geom_errorbar(
          data = summary_data,
          ggplot2::aes(x = time, ymin = ci_low, ymax = ci_high),
          width = 0.08,
          linewidth = 0.35
        ) +
        ggplot2::scale_colour_manual(values = colors) +
        ggplot2::scale_y_log10() +
        ggplot2::labs(x = "Time", y = expression("Relative expression (" * 2^{-Delta * Delta * C[t]} * ")"), title = title) +
        theme_qpcr_nature() +
        ggplot2::theme(legend.position = "top")
    )
  }

  summary_data <- group_interval(samples, "groupId")
  plot <- ggplot2::ggplot(samples, ggplot2::aes(x = groupId, y = foldChange, colour = groupId))
  if (plot_type == "box") {
    plot <- plot + ggplot2::geom_boxplot(width = 0.5, outlier.shape = NA, linewidth = 0.4, colour = "#575B54", fill = NA)
  }
  if (plot_type == "violin") {
    plot <- plot + ggplot2::geom_violin(width = 0.72, linewidth = 0.35, alpha = 0.16, trim = FALSE)
  }
  if (plot_type == "paired") {
    plot <- plot + ggplot2::geom_line(
      ggplot2::aes(group = subjectId),
      colour = "#A7A99F",
      linewidth = 0.35,
      alpha = 0.8
    )
  }
  plot +
    ggplot2::geom_point(
      position = ggplot2::position_jitter(width = 0.075, height = 0, seed = 104),
      size = 1.65,
      alpha = 0.9
    ) +
    ggplot2::geom_errorbar(
      data = summary_data,
      ggplot2::aes(x = groupId, ymin = ci_low, ymax = ci_high),
      inherit.aes = FALSE,
      width = 0.14,
      linewidth = 0.45,
      colour = "#1E211D",
      na.rm = TRUE
    ) +
    ggplot2::geom_point(
      data = summary_data,
      ggplot2::aes(x = groupId, y = center),
      inherit.aes = FALSE,
      shape = 95,
      size = 4.5,
      stroke = 0.6,
      colour = "#1E211D"
    ) +
    ggplot2::scale_colour_manual(values = colors) +
    ggplot2::scale_y_log10() +
    ggplot2::labs(x = NULL, y = expression("Relative expression (" * 2^{-Delta * Delta * C[t]} * ")"), title = title) +
    theme_qpcr_nature()
}

`%||%` <- function(value, fallback) {
  if (is.null(value)) fallback else value
}

format_exact_p <- function(value) {
  if (!is.finite(value)) return("not available")
  if (value < 0.0001) format(value, scientific = TRUE, digits = 3) else formatC(value, format = "f", digits = 5)
}

build_figure_legend <- function(samples, contrasts, method, correction) {
  group_n <- table(samples$groupId)
  n_text <- paste(sprintf("%s %d", names(group_n), as.integer(group_n)), collapse = ", ")
  comparison_text <- if (nrow(contrasts) > 0) {
    paste(
      sprintf(
        "%s: p = %s (adjusted p = %s)",
        contrasts$contrast,
        vapply(contrasts$p_value, format_exact_p, character(1)),
        vapply(
          if ("p_adjusted_family" %in% names(contrasts)) contrasts$p_adjusted_family else contrasts$p_adjusted,
          format_exact_p,
          character(1)
        )
      ),
      collapse = "; "
    )
  } else {
    "No pairwise contrast was requested."
  }
  paste0(
    "Points show independent biological replicates (n = ", n_text, "). ",
    "Center marks and error bars show geometric mean relative expression and 95% CI calculated on the ΔCt scale. ",
    method, " with ", correction, " correction: ", comparison_text, ". ",
    "Technical replicates were averaged before inferential analysis. Source data are provided in the export package."
  )
}

render_publication_svg <- function(plot, width_mm = 90, height_mm = 70) {
  if (!requireNamespace("svglite", quietly = TRUE)) stop("SVG preview requires svglite")
  output <- tempfile("qpcr-preview-", fileext = ".svg")
  on.exit(unlink(output, force = TRUE), add = TRUE)
  svglite::svglite(output, width = width_mm / 25.4, height = height_mm / 25.4)
  print(plot)
  grDevices::dev.off()
  paste(readLines(output, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
}

save_publication_figure <- function(plot, file_stem, width_mm = 90, height_mm = 70, dpi = 300) {
  required <- c("svglite", "ragg")
  missing <- required[!vapply(required, requireNamespace, logical(1), quietly = TRUE)]
  if (length(missing) > 0) stop(sprintf("Figure export requires: %s", paste(missing, collapse = ", ")))
  dir.create(dirname(file_stem), recursive = TRUE, showWarnings = FALSE)
  paths <- list(
    svg = paste0(file_stem, ".svg"),
    pdf = paste0(file_stem, ".pdf"),
    tiff = paste0(file_stem, ".tiff"),
    png = paste0(file_stem, ".png")
  )
  width <- width_mm / 25.4
  height <- height_mm / 25.4

  svglite::svglite(paths$svg, width = width, height = height)
  print(plot)
  grDevices::dev.off()

  grDevices::pdf(
    paths$pdf,
    width = width,
    height = height,
    family = "Helvetica",
    useDingbats = FALSE
  )
  print(plot)
  grDevices::dev.off()

  ragg::agg_tiff(paths$tiff, width = width, height = height, units = "in", res = dpi, compression = "lzw")
  print(plot)
  grDevices::dev.off()

  ragg::agg_png(paths$png, width = width, height = height, units = "in", res = dpi)
  print(plot)
  grDevices::dev.off()

  paths
}
