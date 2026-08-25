FROM node:24-alpine AS builder

RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN pnpm --filter @qpcr/contracts build && pnpm --filter @qpcr/web build

FROM node:24-alpine AS runner

RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=8080

COPY --from=builder /app /app

EXPOSE 8080
CMD ["pnpm", "--filter", "@qpcr/web", "start"]
