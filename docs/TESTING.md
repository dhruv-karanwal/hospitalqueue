# Testing

## Commands
| What | Command |
|---|---|
| Everything | `make test` |
| Backend (pytest) | `make test-backend` |
| Frontend unit (vitest) | `make test-frontend` |
| Build check | `make build` |

## Latest results (Milestone 1, 2026-11-19)
- Backend: `3 passed in 0.22s` (health 200 + payload, unknown route 404, API host is 127.0.0.1)
- Frontend: `Tests 4 passed (4)` (apiUrl, fetchHealth success / HTTP error / network error)
- Build: `✓ built in 570ms`, JS 144.08 kB (46.52 kB gzip)
- Live check: `make backend` + `make frontend`; `/api/health` OK directly and via Vite proxy;
  headless Chromium rendered "Backend: ok (v0.1.0)".
