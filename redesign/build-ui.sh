#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f .env ]]; then
  echo "Fehler: $SCRIPT_DIR/.env fehlt. Bitte zuerst aus .env.example erstellen." >&2
  exit 1
fi

echo "==> Baue Paperless-ngx Redesign-Oberfläche im Node-Container ..."
docker compose --profile build run --rm ui-builder

echo "==> Starte Paperless-ngx Webserver neu, um die neue Oberfläche auszuliefern ..."
docker compose up -d --force-recreate webserver

echo "==> Fertig. Status prüfen:"
docker compose ps webserver
