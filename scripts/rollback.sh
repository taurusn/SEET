#!/bin/bash
# rollback: revert a bad SEET deploy.
#
# Two modes:
#
#   rollback.sh code
#     Re-tag the :prev images back to :latest and restart containers.
#     FAST, LOSSLESS, and is the right answer 90% of the time. The DB
#     stays on the current (new) schema — if your migrations follow the
#     expand/contract pattern (which check-migrations.py enforces), the
#     previous code version is compatible with that schema.
#
#   rollback.sh db
#     Stop writers, restore the LATEST pg_dump from /home/ubuntu/seet-backups/,
#     restart. SLOW and LOSSY — any rows written since the backup are gone.
#     Only use when a migration genuinely corrupted data and forward-fix
#     isn't possible. Requires typing the word CONFIRM.
#
#   rollback.sh full
#     Both: code rollback AND db restore. Same caveats.
#
# Assumes you are on the server as the user that owns /home/ubuntu/SEET
# and can reach `docker compose -p seet`.

set -euo pipefail

MODE="${1:-}"
PROJECT="${SEET_PROJECT:-seet}"
BACKUP_DIR="${SEET_BACKUP_DIR:-/home/ubuntu/seet-backups}"
DB_USER="${SEET_DB_USER:-cafe_user}"
DB_NAME="${SEET_DB_NAME:-cafe_reply}"
ROLLBACK_SERVICES="${SEET_ROLLBACK_SERVICES:-api message-worker reply-worker dlq-worker frontend admin-frontend}"
WRITER_SERVICES="${SEET_WRITER_SERVICES:-api message-worker reply-worker dlq-worker}"

if [ -z "$MODE" ] || [ "$MODE" = "-h" ] || [ "$MODE" = "--help" ]; then
  grep "^# " "$0" | sed 's/^# //; s/^#$//'
  exit 0
fi

rollback_code() {
  echo "rollback: looking for :prev image tags..."
  missing=0
  for svc in $ROLLBACK_SERVICES; do
    if ! docker image inspect "${PROJECT}-${svc}:prev" >/dev/null 2>&1; then
      echo "  !! ${PROJECT}-${svc}:prev not found"
      missing=1
    fi
  done
  if [ "$missing" -eq 1 ]; then
    echo
    echo "rollback: no :prev image to roll back to. Happens if this is the"
    echo "first deploy, or if the previous image was already pruned."
    exit 1
  fi

  for svc in $ROLLBACK_SERVICES; do
    echo "rollback: ${PROJECT}-${svc}:prev -> ${PROJECT}-${svc}:latest"
    docker tag "${PROJECT}-${svc}:prev" "${PROJECT}-${svc}:latest"
  done

  echo "rollback: recreating containers with previous images"
  docker compose -p "$PROJECT" up -d --no-build

  echo "rollback: verifying health"
  sleep 3
  bash "$(dirname "$0")/ci-healthcheck.sh" || {
    echo "rollback: new containers are up but /health still failing — look at logs"
    exit 1
  }
  echo "rollback: code rollback complete"
}

rollback_db() {
  LATEST=$(ls -1t "$BACKUP_DIR"/pre-deploy-*.sql.gz 2>/dev/null | head -1 || true)
  if [ -z "$LATEST" ]; then
    echo "rollback: no backup found in $BACKUP_DIR"
    exit 1
  fi

  echo "rollback: latest backup is $LATEST"
  echo "rollback: this will DROP the current database and restore the backup."
  echo "rollback: any rows written since $(stat -c '%y' "$LATEST" 2>/dev/null || stat -f '%Sm' "$LATEST") will be LOST."
  echo
  read -p "Type CONFIRM to proceed: " answer
  if [ "$answer" != "CONFIRM" ]; then
    echo "rollback: aborted"
    exit 1
  fi

  echo "rollback: stopping writers: $WRITER_SERVICES"
  # shellcheck disable=SC2086
  docker compose -p "$PROJECT" stop $WRITER_SERVICES

  echo "rollback: restoring $LATEST"
  gunzip -c "$LATEST" | docker compose -p "$PROJECT" exec -T db \
    psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1

  echo "rollback: restarting writers"
  # shellcheck disable=SC2086
  docker compose -p "$PROJECT" start $WRITER_SERVICES

  echo "rollback: verifying health"
  sleep 3
  bash "$(dirname "$0")/ci-healthcheck.sh" || {
    echo "rollback: writers restarted but /health failing — inspect logs"
    exit 1
  }
  echo "rollback: db restore complete"
}

case "$MODE" in
  code) rollback_code ;;
  db)   rollback_db ;;
  full)
    rollback_code
    rollback_db
    ;;
  *)
    echo "rollback: unknown mode '$MODE' — use code | db | full"
    exit 1
    ;;
esac
