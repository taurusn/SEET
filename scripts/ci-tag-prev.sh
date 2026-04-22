#!/bin/bash
# ci-tag-prev: snapshot currently-running images with a :prev tag.
#
# Runs between sync-code and build. Captures the image hash of each
# currently-running container and applies `seet-<service>:prev` so that
# if the new deploy goes sideways, we can roll code back with one
# command:   docker tag seet-api:prev seet-api:latest && up -d
#
# First-ever deploy (no running containers) is a no-op.

set -euo pipefail

PROJECT="${CI_PROJECT:-seet}"
SERVICES="${CI_PREV_SERVICES:-api message-worker reply-worker dlq-worker frontend admin-frontend}"

for svc in $SERVICES; do
  cid=$(docker compose -p "$PROJECT" ps -q "$svc" 2>/dev/null || true)
  if [ -z "$cid" ]; then
    echo "tag-prev: $svc has no running container, skipping"
    continue
  fi
  img=$(docker inspect -f '{{.Image}}' "$cid" 2>/dev/null || true)
  if [ -z "$img" ]; then
    echo "tag-prev: $svc container exists but image lookup failed, skipping"
    continue
  fi
  tag="${PROJECT}-${svc}:prev"
  docker tag "$img" "$tag"
  echo "tag-prev: $tag -> $img"
done
