#!/usr/bin/env bash
set -euo pipefail

cd /home/hatim/SEET

echo "==> Pulling latest code..."
git pull origin main

echo "==> Rebuilding and restarting services..."
docker compose up --build -d

echo "==> Cleaning up old images..."
docker image prune -f

echo "==> Deploy complete!"
docker compose ps
