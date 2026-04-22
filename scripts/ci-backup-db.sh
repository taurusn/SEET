#!/bin/bash
# ci-backup-db: pg_dump the SEET database before a deploy, rotate old backups.
#
# Why: every deploy can run `alembic upgrade head`. If a migration goes wrong
# — a bad constraint, a deadlock, a typo — we want a point-in-time dump we
# can restore from without fighting PITR or downtime. Cheap insurance.
#
# Retains BACKUP_RETAIN_COUNT most-recent backups (default 20).
#
# Output file:
#   /home/ubuntu/seet-backups/pre-deploy-<YYYYMMDD-HHMMSS>-<sha>.sql.gz

set -euo pipefail

BACKUP_DIR="${CI_BACKUP_DIR:-/home/ubuntu/seet-backups}"
PROJECT="${CI_PROJECT:-seet}"
DB_USER="${CI_DB_USER:-cafe_user}"
DB_NAME="${CI_DB_NAME:-cafe_reply}"
RETAIN="${BACKUP_RETAIN_COUNT:-20}"
SHA="${CI_COMMIT_SHA:-unknown}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date -u +%Y%m%d-%H%M%S)
OUT_FILE="$BACKUP_DIR/pre-deploy-${TIMESTAMP}-${SHA:0:8}.sql.gz"

echo "backup: writing $OUT_FILE"
docker compose -p "$PROJECT" exec -T db \
  pg_dump --clean --if-exists --no-owner --no-acl -U "$DB_USER" "$DB_NAME" \
  | gzip -c > "$OUT_FILE"

# Fail if the file came out suspiciously small (pg_dump succeeded but
# produced nothing — eg pointed at wrong DB)
SIZE=$(stat -c %s "$OUT_FILE" 2>/dev/null || stat -f %z "$OUT_FILE")
if [ "$SIZE" -lt 1024 ]; then
  echo "backup: file is only ${SIZE} bytes — looks broken, failing"
  rm -f "$OUT_FILE"
  exit 1
fi

echo "backup: ok ($(du -h "$OUT_FILE" | cut -f1))"

# Rotate: keep last $RETAIN, delete the rest
cd "$BACKUP_DIR"
ls -1t pre-deploy-*.sql.gz 2>/dev/null | tail -n +"$((RETAIN + 1))" | while read -r old; do
  echo "backup: rotating out $old"
  rm -f "$old"
done

echo "backup: done, $(ls -1 pre-deploy-*.sql.gz | wc -l) backups retained"
