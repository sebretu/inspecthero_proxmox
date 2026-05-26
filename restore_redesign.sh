#!/bin/bash
# Restore script for redesign task
BACKUP_FILE=$(ls -t /home/sebretu/building-task-manager/backups/redesign_pre_tailwind_*.tar.gz | head -n 1)

if [ -z "$BACKUP_FILE" ]; then
  echo "No backup file found!"
  exit 1
fi

echo "Restoring from $BACKUP_FILE..."
tar -xzf "$BACKUP_FILE" -C /home/sebretu/building-task-manager
echo "Restore complete."
