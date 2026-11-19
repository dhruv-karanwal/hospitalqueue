# Testing

## Commands
| What | Command |
|---|---|
| Backend + frontend unit tests + build | `make test` |
| Backend only (pytest) | `make test-backend` |
| Frontend helpers (vitest) | `make test-frontend` |
| Production build check | `make build` |
| 500-patient benchmark with timings | `make bench` |
| Playwright smoke test (starts both servers) | `make e2e` |
| Everything | `make check` |

## What is tested
- **Schedulers with hand-calculated answers** (`test_schedulers.py`): Silberschatz textbook sets:
  FCFS (24, 3, 3: average wait 17), SJF (6, 8, 7, 3: average wait 7), SRTF (8, 4, 9, 5: average wait 6.5, exact Gantt),
  non-preemptive Priority (average wait 8.2), RR q=4 (average wait 5.667), RR q=1 interleaving, preemption by a critical arrival,
  context-switch cost, tie-breaking, idle gaps, invalid input.
- **Aging, starvation, multi-doctor, I/O** (`test_aging_multi_io.py`): exact aging timeline (P5 to P3 at minute 2, P3 to P1 at minute 4,
  wait 10 to 4), starvation alarm, common vs per-doctor queues, preferred doctor, global preemption of the worst running patient,
  I/O block and interrupt with an exact trace sequence, device-queue contention, multiple device units, compare best-per-metric.
- **Properties** (`test_properties.py`, 57 cases): 7 policies × 2 queue modes × 3 generated workloads with invariant checks after
  every minute (READY set = queue contents, no patient on two doctors, RUNNING/BLOCKED consistent, burst conserved),
  no overlapping segments, metric formulas, waiting = READY time when switch cost is 0, switch-overhead accounting,
  byte-identical repeated runs, and a trace replay that checks every state transition chains correctly.
- **Banker's and sync** (`test_resources_sync.py`): textbook safe sequence P1, P3, P4, P0, P2; grant, wait and deny requests;
  unsafe state; edge cases (no processes, zero need, allocation > max, shape errors); deadlock detection (none and 4 deadlocked);
  race demo without a lock (duplicates) and with mutex or semaphore (2 and 3 workers); token-issue race; primitives; producer-consumer
  blocking with `empty + full = capacity` at every frame.
- **API** (`test_api.py`, 29 cases): every endpoint, 13 invalid-input cases (422), scenario save, load and delete in SQLite,
  run history, all 6 presets load and simulate, live session flow (step, preempting walk-in, filtered trace), session errors.
- **Benchmark** (`test_benchmark.py`): 500 patients under every policy, normal load and a heavy queue, must take under 200 ms each.
- **Frontend** (vitest, 21): API error handling, workload import/export and validation, I/O notation, best-per-metric,
  Gantt layout helpers, trace filter, virtual-list window, debounce.
- **E2E** (`frontend/tests/e2e/smoke.cjs`, 14 checks): load scenario, run, timeline explanation, Gantt, compare, trace filter,
  race demo, live session, labelled controls, skip link, no horizontal scroll at 390 px, no console errors.

## Latest results (2026-11-19, Python 3.11, Node 22, headless Chromium)
```
make test
  backend:  165 passed in 1.32s
            test_aging_multi_io 12 | test_api 29 | test_benchmark 15 | test_health 3
            test_pcb_trace 16 | test_properties 57 | test_resources_sync 17 | test_schedulers 16
  frontend: Test Files 2 passed (2), Tests 21 passed (21)
  build:    ✓ built in 778ms; main chunk 158.41 kB (51.94 kB gzip), every page lazy-loaded (2 to 13 kB each)

make e2e
  14 passed, 0 failed

make bench   (best of 3, trace on, 3 doctors; heavy = 500 arrive within 50 min on 2 doctors, switch cost 1)
  FCFS 8.7 ms | SJF 8.2 | SRTF 11.6 | PRIORITY_NP 7.6 | PRIORITY_P 15.4 | RR 13.7 | PRIORITY_AGING 15.3
  heavy: FCFS 12.9 | SJF 9.3 | SRTF 13.7 | PRIORITY_NP 9.8 | PRIORITY_P 12.9 | RR 15.8 | PRIORITY_AGING 15.1
  API round trip for 500 patients incl. validation and JSON: 102.1 ms
```
All are well under the 200 ms requirement.
