#!/usr/bin/env bash
# /home/sebretu/building-task-manager/scripts/restore.sh
# Script to restore the database from a backup.

set -euo pipefail

# Configuration
DB_CONTAINER="supabase_db_building-task-manager"

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <path_to_dump_file.sql.gz>"
    exit 1
fi

DUMP_FILE=$1

if [ ! -f "$DUMP_FILE" ]; then
    echo "Error: File $DUMP_FILE not found."
    exit 1
fi

echo "--- RESTORE PROCEDURE STARTED ---"

# 1. Ensure Supabase is running
if ! docker ps | grep -q "$DB_CONTAINER"; then
    echo "Supabase is not running. Attempting to start..."
    supabase start
fi

# 2. Prepare the dump (decompress if needed)
if [[ "$DUMP_FILE" == *.gz ]]; then
    echo "Decompressing $DUMP_FILE..."
    gunzip -c "$DUMP_FILE" > temp_restore.sql
    RESTORE_SOURCE="temp_restore.sql"
else
    RESTORE_SOURCE="$DUMP_FILE"
fi

# 3. Restore to database
echo "Restoring data to $DB_CONTAINER..."
# Note: This will overwrite existing data in the public schema if present in the dump.
# We use cats to pipe it into docker exec's stdin.
cat "$RESTORE_SOURCE" | docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres

# 4. Cleanup
if [[ "$DUMP_FILE" == *.gz ]]; then
    rm temp_restore.sql
fi

echo "--- RESTORE COMPLETED ---"
echo "You may need to restart the web application if schema changes were significant."
