#!/usr/bin/env bash
cd "$(dirname "$0")"
attempt=0
echo "[wrapper] start $(date)" >> tournament-import.log
# `until` stops when the import exits 0 (full completion OR a clean daily-cap pause);
# exit 1 = a crash (e.g. ECONNRESET), so we resume from the checkpoint.
until NODE_OPTIONS=--use-system-ca pnpm exec tsx prisma/import-tournament-stats.ts --daily=75000 >> tournament-import.log 2>&1; do
  attempt=$((attempt+1))
  echo "[wrapper] crash #$attempt — resuming in 10s $(date)" >> tournament-import.log
  sleep 10
  if [ "$attempt" -ge 200 ]; then echo "[wrapper] giving up after $attempt attempts" >> tournament-import.log; exit 1; fi
done
echo "[wrapper] import exited cleanly (complete or daily-cap pause) after $attempt resumes $(date)" >> tournament-import.log
