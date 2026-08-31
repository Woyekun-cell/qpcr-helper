library(plumber)

port <- as.integer(Sys.getenv("PORT", unset = "8000"))
host <- Sys.getenv("HOST", unset = "0.0.0.0")
api <- plumber::plumb("plumber.R")
api$setDocs(TRUE)
api$run(host = host, port = port)

