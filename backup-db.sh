#!/usr/bin/env bash
# backup-db.sh — Safe SQLite backup for Kudos social mining DB
# Usage: ./backup-db.sh [optional-label]
# Creates: backups/kudos-YYYY-MM-DD-HH-MM-<label>.db
#
# Safe to run while the server is running — uses SQLite .backup command
# which copies a consistent snapshot without locking the live DB.

set -euo pipefail

DB_PATH="${KUDOS_DB_PATH:-artifacts/api-server/.data/social-mining.db}"
BACKUP_DIR="backups"
LABEL="${1:-auto}"
TIMESTAMP="$(date '+%Y-%m-%d-%H-%M')"
DEST="${BACKUP_DIR}/kudos-${TIMESTAMP}-${LABEL}.db"

# Create backup dir if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Verify source DB exists
if [ ! -f "$DB_PATH" ]; then
  echo "❌  DB not found at: $DB_PATH"
  echo "    Set KUDOS_DB_PATH if your DB is in a different location."
  exit 1
fi

# SQLite .backup is crash-safe and works while the server is running
sqlite3 "$DB_PATH" ".backup '${DEST}'"

SIZE="$(du -sh "$DEST" | cut -f1)"
echo "✅  Backup complete: $DEST ($SIZE)"

# Print participant + reply counts for quick sanity check
PARTICIPANTS="$(sqlite3 "$DEST" "SELECT COUNT(*) FROM participants;" 2>/dev/null || echo '?')"
REPLIES="$(sqlite3 "$DEST" "SELECT COUNT(*) FROM replies;" 2>/dev/null || echo '?')"
echo "    Miners: $PARTICIPANTS · Replies: $REPLIES"

# Keep only the 20 most recent backups to avoid disk bloat
BACKUP_COUNT="$(ls -1 "${BACKUP_DIR}"/kudos-*.db 2>/dev/null | wc -l)"
if [ "$BACKUP_COUNT" -gt 20 ]; then
  OLDEST="$(ls -1t "${BACKUP_DIR}"/kudos-*.db | tail -n +21)"
  echo "$OLDEST" | xargs rm -f
  echo "    Pruned old backups (kept 20 most recent)"
fi
