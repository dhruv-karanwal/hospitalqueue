# Architecture

```
 Browser (React 18 + Vite, 127.0.0.1:5173)
 ┌───────────────────────────────────────────────────────────────┐
 │ App.jsx: hash router, React.lazy pages, sidebar               │
 │ store.jsx: shared workload + last result (localStorage)       │
 │ pages/: Dashboard Simulator Timeline Compare Aging            │
 │         MultiDoctor Resources SyncLab Trace Concepts          │
 │ components/: Gantt (ward board), BarChart, VirtualList, ...   │
 │ lib/: api.js (fetch wrapper) + pure helpers (unit tested)     │
 └───────────────┬───────────────────────────────────────────────┘
                 │ JSON over /api (Vite dev proxy, same origin)
 ┌───────────────▼───────────────────────────────────────────────┐
 │ FastAPI app/main.py (127.0.0.1:8000)                          │
 │  validation: app/models.py (Pydantic, extra=forbid, bounds)   │
 │  live sessions: in-memory dict of Simulation objects (max 32) │
 │  persistence: app/db.py (sqlite3: scenarios, runs)            │
 └───────────────┬───────────────────────────────────────────────┘
                 │ plain Python calls (no I/O, no globals)
 ┌───────────────▼───────────────────────────────────────────────┐
 │ app/engine (pure)                                             │
 │  pcb.py         PCB, states, validated transitions            │
 │  queues.py      ReadyQueue: heap + lazy deletion              │
 │  simulator.py   Simulation: clock, dispatch, preemption,      │
 │                 RR quantum, aging/starvation timers, I/O,     │
 │                 multi-doctor, Gantt, trace, invariants        │
 │  metrics.py     exact per-patient and aggregate metrics       │
 │  analysis.py    compare, aging demo, queue-mode compare, I/O  │
 │  resources.py   Banker's safety/request, deadlock detection   │
 │  sync.py        race demo (mutex/semaphore), producer-consumer│
 │  scenarios.py   6 presets from a fixed-seed LCG               │
 │  trace.py       event log + filter                            │
 └───────────────────────────────────────────────────────────────┘
```

## The simulation loop
One `step()` simulates minute `[t, t+1)` in a fixed order, which is what makes results deterministic:

1. I/O completion interrupts: BLOCKED to READY
2. Start queued I/O on free device units (FIFO, lowest unit first)
3. Arrivals: NEW to READY (per-doctor mode: join the requested or shortest line)
4. Timers: aging boosts and starvation alarms (a heap of `(time, kind, patient, epoch)`)
5. Round Robin quantum expiry (only if someone else is waiting)
6. Dispatch idle doctors (counts a context switch if the doctor last ran someone else)
7. Preemption for SRTF / Priority-P / Aging (global mode: against the worst running patient)
8. Execute one minute per doctor (or one minute of switch overhead), then finish, block for I/O, or continue

`run()` skips idle gaps by jumping the clock to the next arrival or I/O completion.
Live sessions call `advance(n)`, which always steps so the clock keeps moving.

## Data structures and complexity
- Ready queue: binary heap keyed per policy (FIFO: constant key + insertion counter; SJF/SRTF:
  `(remaining, arrival, index)`; Priority: `(effective priority, arrival, index)`). Re-keying (aging)
  pushes a new entry and invalidates the old one, so push, pop and peek are O(log n).
- Arrivals, timers and device completions are heaps, so no per-minute scans of all patients.
- Cost per simulated minute is O(D + log n) for D doctors. 500 patients run in about 8 to 16 ms (see TESTING.md).

## Determinism
No randomness at run time; presets come from a hand-written LCG. Ties break on arrival time, then input
order. A property test serialises two runs of every policy and compares the JSON byte for byte.

## Security and scope
API bound to 127.0.0.1, CORS limited to the dev origin, all bodies validated (`extra="forbid"`,
numeric bounds, total-burst cap), parameterised SQL, no shell execution, no external services.
