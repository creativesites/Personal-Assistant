FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json .npmrc ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY services/whatsapp/package.json ./services/whatsapp/
RUN npm install --legacy-peer-deps --ignore-scripts

COPY tsconfig.base.json ./
COPY packages/shared-types/ ./packages/shared-types/
COPY services/whatsapp/ ./services/whatsapp/
RUN npm run build --workspace=packages/shared-types
RUN npm run build --workspace=services/whatsapp

FROM node:22-bookworm-slim AS runner

# Chromium for Puppeteer (whatsapp-web.js). Puppeteer v20+ is incompatible with Alpine.
RUN apt-get update && apt-get install -y \
  chromium \
  fonts-noto-color-emoji \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json .npmrc ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY services/whatsapp/package.json ./services/whatsapp/
RUN npm install --omit=dev --legacy-peer-deps --ignore-scripts

COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/services/whatsapp/dist ./services/whatsapp/dist

VOLUME ["/app/db/sessions"]
EXPOSE 3001
CMD ["node", "services/whatsapp/dist/index.js"]
