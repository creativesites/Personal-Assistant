#!/usr/bin/env bash
# Local driver: build images in Cloud Build, then roll them out on the VM.
#   PROJECT=zuri-prod deploy/gcp/deploy.sh
# Deploys the commit currently on origin/main (push first).
set -euo pipefail

PROJECT="${PROJECT:?set PROJECT}"
REGION="${REGION:-europe-west2}"
ZONE="${ZONE:-europe-west2-b}"
VM="${VM:-zuri-backend}"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT}/zuri"
TAG="$(git rev-parse --short origin/main)"

cd "$(git rev-parse --show-toplevel)"
git fetch origin main --quiet
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "warning: local HEAD differs from origin/main — deploying origin/main ($TAG)" >&2
fi

gcloud builds submit --project "$PROJECT" --region "$REGION" \
  --config deploy/gcp/cloudbuild.yaml \
  --substitutions "_REGISTRY=${REGISTRY},_TAG=${TAG}" .

gcloud compute ssh "$VM" --project "$PROJECT" --zone "$ZONE" --command \
  "sudo bash -c 'cd /opt/zuri && git fetch --quiet origin main && git reset --hard --quiet ${TAG} && TAG=${TAG} bash deploy/gcp/vm-deploy.sh'"
