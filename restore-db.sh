#!/usr/bin/env bash
# restore-db.sh — Restore Kudos DB from a backup snapshot
# Usage: ./restore-db.sh backups/kudos-2026-06-08-01-30-pre-launch.db
#
# IMPORTANT: Stop the API server before restoring.
# The restore makes a safety copy of the current DB before overwriting.

set -euo pipefail

DB_PATH="${KUDOS_DB_PATH:-artifacts/api-server/.data/social-mining.db}"
BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: ./restore-db.sh <backup-file>"
  echo ""
  echo "Available backups:"
  ls -1t backups/kudos-*.db 2>/dev/null | head -20 || echo "  (none found in ./backups/)"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌  Backup file not found: $BACKUP_FILE"
  exit 1
fi

# Safety: copy current DB before overwriting
if [ -f "$DB_PATH" ]; then
  SAFETY_COPY="${DB_PATH}.pre-restore-$(date '+%Y%m%d-%H%M%S')"
  cp "$DB_PATH" "$SAFETY_COPY"
  echo "⚠️   Current DB saved to: $SAFETY_COPY"
fi

# Copy backup into place
cp "$BACKUP_FILE" "$DB_PATH"

SIZE="$(du -sh "$DB_PATH" | cut -f1)"
PARTICIPANTS="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM participants;" 2>/dev/null || echo '?')"
REPLIES="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM replies;" 2>/dev/null || echo '?')"

echo "✅  Restored: $BACKUP_FILE → $DB_PATH ($SIZE)"
echo "    Miners: $PARTICIPANTS · Replies: $REPLIES"
echo ""
echo "    Restart the API server to pick up the restored DB."
