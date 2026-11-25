#!/usr/bin/env bash
# Runs ON the VM (as root) for every deploy. Expects the repo at /opt/zuri,
# already updated to the commit being deployed, and TAG in the environment.
set -euo pipefail
cd /opt/zuri

: "${TAG:?TAG must be set}"
SECRET_NAME="${SECRET_NAME:-zuri-prod-env}"
COMPOSE="docker compose -f docker-compose.prod.yml -f docker-compose.gcp.yml"

# Production .env lives in Secret Manager, never on disk in git
gcloud secrets versions access latest --secret="$SECRET_NAME" > .env.tmp
mv .env.tmp .env && chmod 600 .env
export TAG

# Keep the running WhatsApp container when its code hasn't changed. Every
# restart re-establishes the Baileys connection and can disturb encryption
# sessions with recipients ("Waiting for this message"), so API/AI-only
# deploys shouldn't touch it.
RUNNING_WA_TAG="$(docker inspect --format '{{.Config.Image}}' zuri-prod-whatsapp-1 2>/dev/null | sed 's/.*://' || true)"
if [ -n "$RUNNING_WA_TAG" ] && [ "$RUNNING_WA_TAG" != "$TAG" ] \
   && git cat-file -e "${RUNNING_WA_TAG}^{commit}" 2>/dev/null \
   && git diff --quiet "$RUNNING_WA_TAG" "$TAG" -- services/whatsapp packages/shared-types package.json package-lock.json; then
  WHATSAPP_TAG="$RUNNING_WA_TAG"
  echo "whatsapp unchanged since ${RUNNING_WA_TAG} — leaving it running"
else
  WHATSAPP_TAG="$TAG"
fi
export WHATSAPP_TAG

$COMPOSE pull api whatsapp intelligence

# Migrations before new code starts (db/ isn't baked into images)
docker run --rm -v "$(pwd)":/app -w /app --env-file .env node:22-alpine \
  sh -c "npm install pg --no-save --silent && node db/migrate.js"

$COMPOSE up -d --no-build --remove-orphans

echo "waiting for api health..."
for i in $(seq 1 45); do
  if $COMPOSE exec -T api wget -qO- http://127.0.0.1:3000/health >/dev/null 2>&1; then
    echo "api healthy (${i}x2s)"; docker image prune -f >/dev/null; exit 0
  fi
  sleep 2
done
echo "api failed health check"; $COMPOSE logs --tail=80 api; exit 1
