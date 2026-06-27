FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy workspace manifests for layer caching
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY services/api/package.json ./services/api/
RUN pnpm install --ignore-scripts

# Copy source and build
COPY tsconfig.base.json ./
COPY packages/shared-types/ ./packages/shared-types/
COPY services/api/ ./services/api/
RUN pnpm --filter @zuri/types build
RUN pnpm --filter api build

# Runtime image
FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY services/api/package.json ./services/api/
RUN pnpm install --prod --ignore-scripts

COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/services/api/dist ./services/api/dist
COPY db/ ./db/

ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "node db/migrate.js && node services/api/dist/index.js"]
