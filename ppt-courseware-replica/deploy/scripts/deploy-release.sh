#!/usr/bin/env bash

set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/digital-person}"
RELEASE_BRANCH="${RELEASE_BRANCH:-release}"
SERVICE_NAME="${SERVICE_NAME:-digital-person}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8787/api/health}"

as_root() {
  if [[ "$EUID" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

cd "$APP_DIR"

git fetch --prune origin "$RELEASE_BRANCH"
if git show-ref --verify --quiet "refs/heads/$RELEASE_BRANCH"; then
  git checkout "$RELEASE_BRANCH"
else
  git checkout --track -b "$RELEASE_BRANCH" "origin/$RELEASE_BRANCH"
fi
git pull --ff-only origin "$RELEASE_BRANCH"

npm ci
npm run build

as_root install -m 0644 deploy/systemd/digital-person.service "/etc/systemd/system/$SERVICE_NAME.service"
as_root systemctl daemon-reload
as_root systemctl enable "$SERVICE_NAME"
as_root systemctl restart "$SERVICE_NAME"
as_root systemctl is-active --quiet "$SERVICE_NAME"

for _attempt in {1..10}; do
  if curl --fail --silent --show-error "$HEALTH_URL" >/dev/null; then
    printf 'Deployment complete: %s is healthy at %s\n' "$SERVICE_NAME" "$HEALTH_URL"
    exit 0
  fi
  sleep 2
done

printf 'Deployment failed: %s did not become healthy at %s\n' "$SERVICE_NAME" "$HEALTH_URL" >&2
exit 1
