#!/usr/bin/env bash
# /home/sebretu/building-task-manager/scripts/qnap-backup.sh
# Script to create daily backups for QNAP to pull.

set -euo pipefail

# Configuration
BACKUP_DIR="/home/sebretu/building-task-manager/backups/daily"
DB_CONTAINER="supabase_db_building-task-manager"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "Starting daily backup at $(date)"

# 1. Database Backup (PostgreSQL from Supabase Docker)
DB_FILENAME="db_backup_${TIMESTAMP}.sql"
echo "Dumping database from $DB_CONTAINER..."
docker exec -t "$DB_CONTAINER" pg_dump -U postgres -d postgres > "${BACKUP_DIR}/${DB_FILENAME}"

# 2. Compress the dump
gzip "${BACKUP_DIR}/${DB_FILENAME}"

# 3. Clean up old backups (older than $RETENTION_DAYS)
echo "Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "db_backup_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete

echo "Backup completed: ${BACKUP_DIR}/${DB_FILENAME}.gz"
