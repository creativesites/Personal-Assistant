FROM node:22-alpine AS builder

# Chromium is required by open-wa — install system deps
RUN apk add --no-cache chromium nss freetype freetype-dev harfbuzz ca-certificates ttf-freefont

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

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

FROM node:22-alpine AS runner
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

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
