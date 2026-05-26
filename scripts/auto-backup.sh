#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/root/building-task-manager"
LOG="/root/building-task-manager/auto-backup.log"

{
  echo "----- $(date +'%Y-%m-%d %H:%M:%S') auto-backup start -----"
  echo "whoami=$(whoami) pwd=$(pwd)"
} >> "$LOG" 2>&1

cd "$REPO_DIR" >> "$LOG" 2>&1

git fetch origin >> "$LOG" 2>&1 || true

# jeśli brak zmian -> nic nie rób
if git diff --quiet && git diff --cached --quiet; then
  echo "no changes, exit 0" >> "$LOG"
  exit 0
fi

git add -A >> "$LOG" 2>&1

git commit -m "auto-backup: $(date +%Y-%m-%d %H:%M)" --no-verify >> "$LOG" 2>&1 || true

git push origin HEAD >> "$LOG" 2>&1

git tag "auto-backup-$(date +%Y%m%d-%H%M)" >> "$LOG" 2>&1 || true
git push origin --tags >> "$LOG" 2>&1 || true

echo "done" >> "$LOG"
