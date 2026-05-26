#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/root/building-task-manager"
cd "$REPO_DIR"

# pobierz remote info (opcjonalnie)
git fetch origin >/dev/null 2>&1 || true

# jeśli brak zmian -> nic nie rób
if git diff --quiet && git diff --cached --quiet; then
  exit 0
fi

git add -A
git commit -m "auto-backup: $(date +%Y-%m-%d %H:%M)" --no-verify || true
git push origin HEAD

# tag (opcjonalnie) - możesz zakomentować jeśli nie chcesz tylu tagów
git tag "auto-backup-$(date +%Y%m%d-%H%M)" || true
git push origin --tags || true
