#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PIDS=()

start() {
  local label="$1"
  shift

  echo "[$label] starting: $*"
  "$@" &
  PIDS+=("$!")
}

shutdown() {
  if [ "${#PIDS[@]}" -eq 0 ]; then
    return
  fi

  echo
  echo "[dev:all] stopping ${#PIDS[@]} process(es)..."
  kill "${PIDS[@]}" 2>/dev/null || true
  wait "${PIDS[@]}" 2>/dev/null || true
}

trap shutdown EXIT INT TERM

start "api" npm run dev
start "worker:stitch" npm run dev:worker:stitch
start "worker:transcode" npm run dev:worker:transcode
start "worker:asr" npm run dev:worker:asr
start "worker:export" npm run dev:worker:export
start "worker:maintenance" npm run dev:worker:maintenance

# Portable replacement for `wait -n` (not available on older macOS bash).
while true; do
  for pid in "${PIDS[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      wait "$pid" 2>/dev/null || true
      exit 0
    fi
  done
  sleep 1
done
