#!/usr/bin/env bash
set -euo pipefail

# Pliki, które traktujemy jako "DO NOT TOUCH"
FILES=(
  # ✅ App Router (NOWE) - tiles endpoint
  "web/src/app/api/tiles/[planId]/[z]/[x]/[y].png/route.ts"

  # viewer / map
  "web/src/components/PlanViewer.tsx"
  "web/src/components/PlanMap.tsx"

  # generator
  "web/scripts/generate-tiles.mjs"
)

LOCKFILE="tools/tiles.lock"

cmd="${1:-check}"

hash_files() {
  for f in "${FILES[@]}"; do
    if [[ ! -f "$f" ]]; then
      echo "Missing file: $f" >&2
      exit 2
    fi
  done

  # Stabilny output: sha256sum + sort
  sha256sum "${FILES[@]}" | sort
}

case "$cmd" in
  init|update)
    echo "# tiles lock (sha256) - generated on $(date -u +"%Y-%m-%dT%H:%M:%SZ")" > "$LOCKFILE"
    hash_files >> "$LOCKFILE"
    echo "OK: wrote $LOCKFILE"
    ;;
  check)
    if [[ ! -f "$LOCKFILE" ]]; then
      echo "Lockfile not found: $LOCKFILE"
      echo "Run: tools/tiles-lock.sh init"
      exit 2
    fi
    tmp="$(mktemp)"
    echo "# tiles lock (sha256) - check generated on $(date -u +"%Y-%m-%dT%H:%M:%SZ")" > "$tmp"
    hash_files >> "$tmp"

    # porównujemy tylko linie z hashami (pomijamy nagłówek)
    if ! diff -u <(tail -n +2 "$LOCKFILE") <(tail -n +2 "$tmp") >/dev/null; then
      echo "❌ Tiles layer changed!"
      echo
      echo "Diff (expected vs current):"
      diff -u <(tail -n +2 "$LOCKFILE") <(tail -n +2 "$tmp") || true
      echo
      echo "If this change is intentional:"
      echo "  tools/tiles-lock.sh update"
      echo "  git add $LOCKFILE"
      echo "  git commit -m \"tiles: update lock\""
      exit 1
    fi

    echo "✅ Tiles layer OK (no changes)"
    ;;
  *)
    echo "Usage: $0 {check|init|update}"
    exit 2
    ;;
esac
