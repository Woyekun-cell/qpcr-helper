FROM rocker/r-ver:4.6.1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2-dev \
    libcurl4-openssl-dev \
    libfontconfig1-dev \
    libfreetype6-dev \
    libfribidi-dev \
    libharfbuzz-dev \
    libjpeg-dev \
    libpng-dev \
    libssl-dev \
    libtiff5-dev \
    libxml2-dev \
    fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY install.R ./install.R
RUN Rscript install.R
COPY . .

ENV PORT=8000
EXPOSE 8000
CMD ["Rscript", "run.R"]

