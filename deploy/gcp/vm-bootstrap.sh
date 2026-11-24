#!/usr/bin/env bash
# One-time setup for the Zuri backend VM (Debian 12, Google image — gcloud
# preinstalled). Run as root: sudo bash vm-bootstrap.sh <artifact-registry-host>
set -euo pipefail

AR_HOST="${1:?usage: vm-bootstrap.sh europe-west2-docker.pkg.dev}"
REPO_URL="https://github.com/creativesites/Personal-Assistant.git"

# Docker Engine + compose plugin
if ! command -v docker >/dev/null; then
  apt-get update
  apt-get install -y ca-certificates curl git
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

# 2 GB swap — headroom for build-free but memory-spiky AI/PDF work
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Let root's docker pull from Artifact Registry via the VM service account
gcloud auth configure-docker "$AR_HOST" --quiet

[ -d /opt/zuri/.git ] || git clone "$REPO_URL" /opt/zuri
echo "bootstrap complete"
