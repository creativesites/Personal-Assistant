FROM node:22-alpine AS builder
WORKDIR /app

# Copy workspace manifests for layer caching
COPY package.json .npmrc ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY services/api/package.json ./services/api/
RUN npm install --legacy-peer-deps --ignore-scripts

# Copy source and build
COPY tsconfig.base.json ./
COPY packages/shared-types/ ./packages/shared-types/
COPY services/api/ ./services/api/
RUN npm run build --workspace=packages/shared-types
RUN npm run build --workspace=services/api

# Runtime image
FROM node:22-alpine AS runner
WORKDIR /app

COPY package.json .npmrc ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY services/api/package.json ./services/api/
RUN npm install --omit=dev --legacy-peer-deps --ignore-scripts

COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/services/api/dist ./services/api/dist

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "services/api/dist/index.js"]
