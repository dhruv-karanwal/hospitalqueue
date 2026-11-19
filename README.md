# MediQueue OS

A hospital queue scheduling simulator for an Operating Systems course. Patients are processes,
doctors are CPUs, lab / X-ray / pharmacy are I/O devices, and beds and ambulances are resources.
It compares seven CPU scheduling policies on the same workload and shows fairness effects:
the convoy effect, starvation, and how aging fixes it. Every decision is explained in plain language.

> **Disclaimer:** this is a simulation for evaluating queue policies. It is **not** a clinical
> system. Priority levels (1 = critical ... 5 = routine) are human inputs, not computed triage.

## What it covers
| OS concept | Where in the app |
|---|---|
| Process / PCB / state machine | Dashboard process table, Trace |
| FCFS, SJF, SRTF, Priority (P / NP), Round Robin, Priority + Aging | Simulator, Timeline, Compare |
| Preemption, context switches with configurable cost | Timeline (⚡ marks, hatched blocks), Compare |
| Starvation detection and aging | Starvation and aging lab |
| Convoy effect | Compare with the "Convoy effect" preset |
| Multi-doctor: common queue vs queue per doctor | Multi-doctor |
| I/O blocking, device queues, completion interrupts | I/O and resources, Trace |
| Banker's safety and request algorithm, deadlock detection | I/O and resources |
| Race condition vs mutex / semaphore | Sync lab |
| Producer-consumer bounded buffer | Sync lab |
| Execution trace | Trace, Timeline decision panel |

See [docs/CONCEPTS.md](docs/CONCEPTS.md) for the concept to code to screen mapping.

## Setup
Requires Python 3.11+, Node 18+ and `make`.
```bash
make setup        # creates backend/.venv and installs npm packages
```

## Run (two commands, two terminals)
```bash
make backend      # API on http://127.0.0.1:8000 (loopback only)
make frontend     # UI  on http://127.0.0.1:5173 (proxies /api to the backend)
```
Open http://127.0.0.1:5173. Start on **Simulator**, load a scenario, press Run, then open **Timeline**.

## Test
```bash
make test         # backend pytest (165) + frontend vitest (21) + production build
make bench        # 500-patient benchmark with timings
make e2e          # Playwright smoke test of the main flow (starts both servers)
make check        # all of the above
```
Latest real results: [docs/TESTING.md](docs/TESTING.md).

## Preset scenarios
1. OPD morning rush (30 patients, 3 doctors)
2. Emergency surge (starvation without aging)
3. Convoy effect (one long consultation first)
4. Multi-counter government service (common queue vs separate queues)
5. Ambulance dispatch (Banker's safety for beds, ambulances, lab devices)
6. Lab-heavy day (many I/O blocks and interrupts)

## Screenshots (placeholders for the report)
1. Dashboard: live session with clock, doctors, queues
2. Simulator: patient table and parameters
3. Timeline: ward board Gantt with decision panel
4. Compare: all policies with best values starred
5. Starvation and aging lab: per-patient READY wait, with and without aging
6. Multi-doctor: common queue vs queue per doctor
7. I/O and resources: device timeline and Banker's matrices with safe sequence
8. Sync lab: race condition table and producer-consumer buffer
9. Trace: filtered event log
10. Concepts and viva

## Docs
[Architecture](docs/ARCHITECTURE.md) · [Concepts](docs/CONCEPTS.md) · [Viva Q&A](docs/VIVA.md) ·
[Limitations](docs/LIMITATIONS.md) · [5-minute demo](docs/DEMO.md) · [Testing](docs/TESTING.md)
