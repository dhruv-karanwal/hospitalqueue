# CLAUDE.md: MediQueue OS

## Purpose
Hospital queue scheduling simulator for an Operating Systems course. Patients = processes,
doctors/counters = CPUs, lab/X-ray/pharmacy = I/O devices, beds/ambulances/lab devices = Banker's resources.
Focus: comparing scheduling policies and fairness (starvation vs aging), explainable in a viva.
**A simulation for evaluating queue policies, not a clinical system; priority levels are human inputs.**

## Architecture
- `backend/`: FastAPI + Pydantic on **127.0.0.1:8000** only. Routes in `app/main.py` are thin: validate, call engine, return.
  All logic is in `app/engine/` as **pure code** (data in, data out; no globals, no I/O).
- SQLite (stdlib `sqlite3`) in `app/db.py`: saved scenarios and run history. Path override: `MEDIQUEUE_DB`.
- Live sessions: in-memory `Simulation` objects in `main._sessions` (max 32, per-session lock).
- `frontend/`: React 18 + Vite on **127.0.0.1:5173**; Vite proxies `/api`. Hash router, every page `React.lazy`.
  Shared workload and last result in `src/store.jsx` (persisted to localStorage, debounced).
- Deterministic integer clock. Step order inside a minute is fixed (see docs/ARCHITECTURE.md). Ties: arrival, then input order.

## Folder map
```
backend/app/main.py            routes, sessions, API_HOST/API_PORT, `python -m app.main`
backend/app/models.py          Pydantic models (extra=forbid, bounds, cross-field validators)
backend/app/db.py              sqlite3 persistence
backend/app/engine/pcb.py      PCB, states, TRANSITIONS, check_transition
backend/app/engine/queues.py   ReadyQueue (heap + lazy deletion)
backend/app/engine/simulator.py Simulation (step/run/advance/snapshot/check_invariants), SimConfig, simulate()
backend/app/engine/metrics.py  patient_row, aggregate, best_per_metric
backend/app/engine/analysis.py compare, aging_demo, queue_mode_compare, io_report
backend/app/engine/resources.py Banker's safety/request, detect_deadlock
backend/app/engine/sync.py     Mutex, Semaphore, race_demo, producer_consumer
backend/app/engine/scenarios.py 6 presets (fixed-seed LCG), BANKER_AMBULANCE
backend/app/engine/trace.py    Trace, filter_events
backend/tests/                 pytest; helpers.py; conftest sets a temp MEDIQUEUE_DB + `client` fixture
frontend/src/App.jsx           shell, nav, lazy routes, focus management
frontend/src/store.jsx         WorkloadProvider / useWorkload
frontend/src/pages/            Dashboard Simulator Timeline Compare Aging MultiDoctor Resources SyncLab Trace Concepts
frontend/src/components/       ui.jsx, Gantt.jsx (ward board), BarChart.jsx, VirtualList.jsx, Matrix.jsx, ScenarioPicker.jsx, ParamControls.jsx
frontend/src/lib/              api.js, workload.js, metrics.js, gantt.js, trace.js, virtual.js, hooks.js, nav.js, concepts.js
frontend/src/test/             vitest (pure helpers)
frontend/tests/e2e/smoke.cjs   Playwright smoke (system playwright package)
scripts/e2e.sh                 starts both servers, runs smoke, stops them
scripts/gen-viva.mjs           writes docs/VIVA.md from src/lib/concepts.js
docs/                          ARCHITECTURE, CONCEPTS, VIVA, LIMITATIONS, DEMO, TESTING
```

## Commands
- `make setup`: venv (python3.11) + npm install
- `make backend` / `make frontend`: run API / UI
- `make test`: pytest + vitest + build · `make bench` · `make e2e` · `make check` (all)
- `make viva`: regenerate docs/VIVA.md after editing `frontend/src/lib/concepts.js`

## Conventions
- Tests first; schedulers checked against hand-calculated textbook answers; property tests run with `check_invariants=True`.
- Engine never imports FastAPI or sqlite. Routes contain no scheduling logic. No shell execution anywhere.
- Every state change goes through `Simulation._set_state` (validates, does accounting, enqueues, traces).
- New trace event types must be added to `frontend/src/lib/trace.js` TYPE_LABELS.
- UI: tokens in `styles.css`; triage colours `--p1..--p5` always paired with a "P#" text label; sentence case;
  labels on every control (the e2e test checks this); no new dependencies without need.
- Update this file, docs/TESTING.md (real numbers) and docs/CONCEPTS.md when behaviour changes.

## Current status
All 14 milestones done (built in one pass at the user's request). Latest: backend 165 passed, frontend 21 passed,
build OK (52 kB gzip main chunk), e2e 14/14, 500-patient benchmark 8 to 16 ms per policy. UI verified in Chromium
(light, dark, 390 px phone): no console errors, no horizontal scroll.

## Decisions
- D1: Repo `dhruv-karanwal/hospitalqueue`, branch `claude/gifted-albattani-1kyqjf`.
- D2: Python 3.11 venv at `backend/.venv`.
- D3: Plain CSS with design tokens, no Tailwind; hand-written SVG/CSS charts, no Recharts (smaller bundle).
- D4: The `ui-ux-pro-max` skill is not installed here; UI followed the `frontend-design` skill. Identity: Manchester-triage
  colours for priority, ink navy plus chart-paper surfaces, scrub teal for actions, self-hosted Atkinson Hyperlegible font.
- D5: Waiting = turnaround - burst - blocked (I/O time excluded; switch overhead included). Starvation uses READY time.
- D6: A context switch is counted when a doctor starts a patient other than the one it last ran (first patient is free).
  Switch cost is non-preemptible overhead before the patient's first minute.
- D7: Aging uses per-patient timers (no per-minute scans); boosts persist until completion. Priority + Aging is preemptive.
- D8: RR: new arrivals at minute t join the queue before a patient whose quantum expired at t. Quantum renews if nobody waits.
- D9: Per-doctor mode = join the shortest line by head count at arrival, stay there (affinity), return there after I/O.
- D10: Live `advance()` always ticks the clock (an empty ward still has time); batch `run()` skips idle gaps.
- D11: Race demo uses deterministic one-instruction round-robin interleaving (worst case) so the bug is reproducible.
- D12: Govt preset tuned (long jobs at positions 0, 4, 8, one arrival per minute) because shortest-line-by-count can match
  a common queue on some workloads; documented in LIMITATIONS.
