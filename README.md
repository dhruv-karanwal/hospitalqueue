# MediQueue OS

A hospital queue scheduling simulator built for an Operating Systems course. Patients are
processes, doctors are CPUs, lab and X-ray are I/O devices, and beds and ambulances are
resources. It compares CPU scheduling policies and shows fairness effects such as starvation and aging.

> **Disclaimer:** this is a simulation for evaluating queue policies. It is **not** a clinical
> system, and priority levels are human inputs.

## Setup
Requires Python 3.11+ and Node 18+.
```bash
make setup
```

## Run (two commands, two terminals)
```bash
make backend    # API  -> http://127.0.0.1:8000  (loopback only)
make frontend   # UI   -> http://127.0.0.1:5173
```

## Test
```bash
make test       # pytest + vitest + production build
```
See [docs/TESTING.md](docs/TESTING.md) for the latest results.

## Screenshots (placeholders)
1. Dashboard 2. Simulator 3. Timeline (Gantt) 4. Compare 5. Starvation & Aging Lab
6. Multi-doctor 7. I/O & Resources 8. Sync Lab 9. Trace 10. Concepts/Viva

## Status
In progress, see [CLAUDE.md](CLAUDE.md) for milestones.
