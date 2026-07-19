FROM node:22-alpine AS builder
WORKDIR /app

# Copy root manifests
COPY package.json .npmrc ./

# Copy all workspace manifests for caching
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/pdf-templates/package.json ./packages/pdf-templates/
COPY services/api/package.json ./services/api/

# Install dependencies (workspaces)
RUN npm install --legacy-peer-deps --ignore-scripts

# Copy source
COPY tsconfig.base.json ./
COPY packages/shared-types/ ./packages/shared-types/
COPY packages/pdf-templates/ ./packages/pdf-templates/
COPY services/api/ ./services/api/

# Build
RUN npm run build --workspace=packages/shared-types
RUN npm run build --workspace=packages/pdf-templates
RUN npm run build --workspace=services/api

# Runtime stage
FROM node:22-alpine AS runner
WORKDIR /app

RUN apk add --no-cache fontconfig ttf-dejavu

# Copy only necessary files
COPY package.json .npmrc ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/pdf-templates/package.json ./packages/pdf-templates/
COPY services/api/package.json ./services/api/

# Install production deps
RUN npm install --omit=dev --legacy-peer-deps --ignore-scripts

# Copy built artifacts
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/packages/pdf-templates/dist ./packages/pdf-templates/dist
COPY --from=builder /app/services/api/dist ./services/api/dist

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "services/api/dist/index.js"]
