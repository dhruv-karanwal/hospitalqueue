#!/usr/bin/env bash
# Starts backend + frontend, runs the Playwright smoke test, then stops both.
set -euo pipefail
cd "$(dirname "$0")/.."
(cd backend && .venv/bin/python -m app.main) > /tmp/mq-backend.log 2>&1 &
BE=$!
(cd frontend && npx vite --host 127.0.0.1 --port 5173 --strictPort) > /tmp/mq-frontend.log 2>&1 &
FE=$!
trap 'kill $BE $FE 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do
  curl -sf http://127.0.0.1:5173/api/health >/dev/null 2>&1 && break
  sleep 0.5
done
node frontend/tests/e2e/smoke.cjs
