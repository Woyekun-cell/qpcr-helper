source(file.path("R", "statistics.R"))
source(file.path("R", "figures.R"))
source(file.path("R", "export.R"))
source(file.path("R", "service.R"))

parse_request_json <- function(request) {
  if (is.null(request$postBody) || !nzchar(request$postBody)) stop("request body is required")
  jsonlite::fromJSON(request$postBody, simplifyVector = FALSE)
}

allowed_origins <- function() {
  value <- Sys.getenv("ALLOWED_ORIGINS", unset = "http://localhost:3000")
  trimws(strsplit(value, ",", fixed = TRUE)[[1]])
}

#* @filter authenticate
function(req, res) {
  if (identical(req$PATH_INFO, "/health")) return(forward())
  secret <- Sys.getenv("ANALYSIS_R_SHARED_SECRET", unset = "")
  if (!request_authorized(req$HTTP_AUTHORIZATION %||% "", secret)) {
    res$status <- 404L
    return(list(status = "not_found"))
  }
  forward()
}

#* @filter cors
function(req, res) {
  origin <- req$HTTP_ORIGIN
  if (!is.null(origin) && origin %in% allowed_origins()) {
    res$setHeader("Access-Control-Allow-Origin", origin)
    res$setHeader("Vary", "Origin")
    res$setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
    res$setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  }
  if (identical(req$REQUEST_METHOD, "OPTIONS")) {
    res$status <- 204L
    return(list())
  }
  forward()
}

#* Liveness probe
#* @get /health
#* @serializer unboxedJSON list(digits=15, na="null")
function() {
  list(status = "ok", service = "qpcr-analysis-r", backend = "R")
}

#* Design-driven qPCR statistics
#* @post /v1/analyze
#* @serializer unboxedJSON list(digits=15, na="null")
function(req, res) {
  tryCatch(
    run_analysis_payload(parse_request_json(req)),
    error = function(error) {
      res$status <- 422L
      list(status = "failed", error = conditionMessage(error))
    }
  )
}

#* Render an editable R/ggplot2 SVG preview
#* @post /v1/preview
#* @serializer unboxedJSON list(digits=15, na="null")
function(req, res) {
  tryCatch(
    run_preview_payload(parse_request_json(req)),
    error = function(error) {
      res$status <- 422L
      list(status = "failed", error = conditionMessage(error))
    }
  )
}

#* Build a complete research export ZIP
#* @post /v1/export
#* @serializer contentType list(type="application/zip")
function(req, res) {
  temporary <- tempfile("qpcr-export-api-")
  dir.create(temporary)
  on.exit(unlink(temporary, recursive = TRUE, force = TRUE), add = TRUE)
  tryCatch({
    bundle <- run_export_payload(parse_request_json(req), destination = temporary)
    res$setHeader("Content-Disposition", "attachment; filename=qpcr-helper-research-export.zip")
    size <- file.info(bundle$zip)$size
    connection <- file(bundle$zip, "rb")
    on.exit(close(connection), add = TRUE)
    readBin(connection, what = "raw", n = size)
  }, error = function(error) {
    res$status <- 422L
    res$setHeader("Content-Type", "application/json; charset=utf-8")
    charToRaw(jsonlite::toJSON(list(status = "failed", error = conditionMessage(error)), auto_unbox = TRUE))
  })
}
