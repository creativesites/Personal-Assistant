#!/usr/bin/env bash
# Manual production deployment script.
# Run on the ECS server: bash scripts/deploy.sh
set -euo pipefail

COMPOSE="docker compose -f docker-compose.prod.yml"

echo "==> Pulling latest code"
git pull origin main

echo "==> Building updated images"
$COMPOSE build --no-cache api intelligence whatsapp

echo "==> Restarting services (migrations run automatically on api startup)"
$COMPOSE up -d --no-deps --force-recreate api intelligence whatsapp

echo "==> Waiting for API health check..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:5500/api/health > /dev/null 2>&1; then
    echo "    API healthy after $((i * 2))s"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: API did not become healthy in 60s"
    $COMPOSE logs --tail=50 api
    exit 1
  fi
  sleep 2
done

echo "==> Cleaning up old images"
docker image prune -f

echo "==> Deployment complete"
$COMPOSE ps
