# CLAUDE.md — MediQueue OS

## Purpose
Hospital queue scheduling simulator for an Operating Systems course. Patients = processes,
doctors/counters = CPUs, lab/X-ray = I/O devices, beds/ambulances = resources. Main focus:
comparing scheduling policies and fairness (starvation vs aging). **This is a simulation for
evaluating queue policies, not a clinical system; priority levels are human inputs.**

## Architecture
- `backend/` FastAPI + Pydantic, bound to **127.0.0.1:8000** only. Routes in `app/main.py` are thin;
  all logic is in `app/engine/` as **pure functions** (data in -> data out, no global state, no I/O).
- SQLite (stdlib `sqlite3`) in `app/db.py` for saved scenarios and run history (milestone 9).
- `frontend/` React 18 + Vite on **127.0.0.1:5173**; Vite proxies `/api` to the backend.
  All HTTP goes through `src/lib/api.js` (uniform `ApiError`).
- Deterministic integer simulated clock: same input -> byte-identical output.

## Folder map
```
backend/app/main.py        routes, API_HOST/API_PORT, uvicorn entry (python -m app.main)
backend/app/models.py      Pydantic request/response models
backend/app/db.py          SQLite persistence
backend/app/engine/        simulation core, schedulers, resources, sync, trace (pure)
backend/tests/             pytest (conftest adds backend/ to sys.path)
frontend/src/lib/          client helpers (api.js), unit-tested with Vitest
frontend/src/test/         Vitest tests
docs/                      TESTING.md (+ ARCHITECTURE, CONCEPTS, VIVA, LIMITATIONS, DEMO later)
Makefile                   setup / backend / frontend / test / build
```

## Commands
- `make setup` — create venv (python3.11) and install npm deps
- `make backend` — run API on 127.0.0.1:8000
- `make frontend` — run UI on 127.0.0.1:5173
- `make test` — backend pytest + frontend vitest + production build
- Single suites: `make test-backend`, `make test-frontend`, `make build`

## Conventions
- Tests first for each milestone; textbook examples with hand-calculated answers for schedulers.
- Engine never imports FastAPI/sqlite; routes never contain scheduling logic.
- Validate all input with Pydantic bounds. No shell execution anywhere. No external services.
- Pinned frontend deps; keep dependencies minimal (React, ReactDOM, Vite, Vitest only so far).
- Accessibility: labels, keyboard, contrast; color never the only carrier of meaning.
- Commit after each green milestone; update this file and docs/TESTING.md each time.

## Current status
- [x] M1 Scaffold, health check, test setup (backend 3 tests, frontend 4 tests, build OK, UI verified in Chromium)
- [ ] M2 Engine core (PCB, clock, state machine, trace, metrics)
- [ ] M3 Schedulers FCFS/SJF/SRTF/Priority/RR
- [ ] M4 Aging, starvation, context-switch cost
- [ ] M5 Multi-doctor (global vs per-doctor queues)
- [ ] M6 I/O blocking and interrupts
- [ ] M7 Banker's safety + deadlock detection
- [ ] M8 Sync: race demo, mutex/semaphore, producer-consumer
- [ ] M9 API layer, SQLite, scenarios
- [ ] M10 Frontend: design system, Simulator, Timeline, Compare
- [ ] M11 Frontend: Aging Lab, Multi-doctor, I/O & Resources, Sync Lab, Trace, Concepts/Viva
- [ ] M12 Live session mode
- [ ] M13 Benchmark (500 patients < 200 ms), a11y pass
- [ ] M14 Docs, demo script

## Decisions
- D1: Project lives in GitHub repo `dhruv-karanwal/hospitalqueue`; work on branch `claude/gifted-albattani-1kyqjf`.
- D2: Python 3.11 venv at `backend/.venv` (system default is 3.13; 3.11 matches the stated minimum).
- D3: Plain CSS with design tokens (CSS custom properties) instead of Tailwind — fewer deps, smaller bundle.
- D4: The `ui-ux-pro-max` skill is **not installed** in this environment; UI work uses the installed
  `frontend-design` skill plus a token-based accessible design system.
- D5: Vite dev proxy for `/api` so the browser is same-origin; CORS allowlist only covers 127.0.0.1/localhost:5173.
