#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p backups
STAMP=$(date -u +"%Y%m%d_%H%M%S")
OUT="backups/tiles-working-$STAMP.tar.gz"
MAN="backups/tiles-working-$STAMP.MANIFEST.txt"

tar -czf "$OUT" \
  web/src/components/PlanViewer.tsx \
  web/src/pages/api/tiles/[planId]/[z]/[x]/[y].png.ts \
  web/scripts/generate-tiles.mjs \
  web/public/tiles/88888888-8888-8888-8888-888888888888/meta.json

{
  echo "DATE_UTC=$(date -u +"%F %T")"
  echo "GIT_HEAD=$(git rev-parse HEAD 2>/dev/null || true)"
  echo "GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  echo
  echo "ARCHIVE=$OUT"
  echo
  sha256sum \
    web/src/components/PlanViewer.tsx \
    web/src/pages/api/tiles/[planId]/[z]/[x]/[y].png.ts \
    web/scripts/generate-tiles.mjs \
    web/public/tiles/88888888-8888-8888-8888-888888888888/meta.json
} > "$MAN"

echo "[ok] wrote $OUT"
echo "[ok] wrote $MAN"
