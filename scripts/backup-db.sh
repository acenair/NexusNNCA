#!/usr/bin/env bash
# Nightly MongoDB backup: dump to local dir + optional S3 sync.
# Cron: 0 2 * * * /opt/nnca/scripts/backup-db.sh
set -euo pipefail
STAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=${BACKUP_DIR:-/opt/nnca/backups}
KEEP_DAYS=${KEEP_DAYS:-14}
mkdir -p "$BACKUP_DIR"
docker compose -f /opt/nnca/docker-compose.yml exec -T mongo mongodump --archive --gzip > "$BACKUP_DIR/nnca_$STAMP.archive.gz"
if [[ -n "${BACKUP_S3_TARGET:-}" ]]; then
  aws s3 cp "$BACKUP_DIR/nnca_$STAMP.archive.gz" "$BACKUP_S3_TARGET/" --endpoint-url "${S3_ENDPOINT:-}"
fi
find "$BACKUP_DIR" -name "nnca_*.archive.gz" -mtime +"$KEEP_DAYS" -delete
echo "backup done: nnca_$STAMP.archive.gz"
