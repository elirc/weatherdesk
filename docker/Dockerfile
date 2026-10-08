FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .

FROM base AS webbuild
RUN pnpm build

FROM base AS worker
CMD ["pnpm", "worker"]

FROM webbuild AS web
EXPOSE 3000
CMD ["pnpm", "start"]
