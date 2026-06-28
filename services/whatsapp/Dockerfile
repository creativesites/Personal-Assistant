FROM node:22-bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/* \
    && git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"

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

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/* \
    && git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"

ENV NODE_ENV=production

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
