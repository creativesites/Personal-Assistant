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
