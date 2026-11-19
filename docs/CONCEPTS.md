# OS concepts: code and screens

| # | Concept | Engine code | API | UI screen | Tests |
|---|---|---|---|---|---|
| 1 | Process management, PCB, validated state transitions, READY queue consistent with the process table | `engine/pcb.py`, `simulator.py` (`_set_state`, `check_invariants`) | `/api/simulate`, `/api/session/*` | Dashboard process table, Trace | `test_pcb_trace.py`, `test_properties.py` |
| 2 | FCFS, SJF, SRTF, Priority NP/P, RR (quantum), Priority + Aging | `simulator.py` (`_key`, `_dispatch`, `_preempt`, `_quantum`), `queues.py` | `/api/simulate`, `/api/compare` | Simulator, Timeline, Compare | `test_schedulers.py` (textbook answers) |
| 3 | Preemption, context switch count and cost | `simulator.py` (`_preempt_doctor`, `_dispatch`, `_execute`) | `params.context_switch_cost` | Timeline (⚡, hatched blocks), Compare | `test_priority_preemptive_*`, `test_context_switch_cost`, `test_properties_with_switch_cost` |
| 4 | Starvation detection and aging | `simulator.py` (`_arm_timers`, `_timers`), `analysis.aging_demo` | `/api/aging-demo` | Starvation and aging lab | `test_starvation_without_aging`, `test_aging_hand_calculated`, `test_aging_demo_*` |
| 5 | Convoy effect | `scenarios.py` (`convoy-effect`) | `/api/scenarios/convoy-effect` | Compare | `test_fcfs_textbook`, `test_fcfs_reordered_shows_convoy` |
| 6 | Multi-doctor: common queue vs queue per doctor | `simulator.py` (`queue_mode`), `analysis.queue_mode_compare` | `/api/multi-doctor/compare` | Multi-doctor | `test_two_doctors_global_queue`, `test_per_doctor_*`, `test_queue_mode_compare_govt` |
| 7 | I/O blocking, device queues, completion interrupts | `simulator.py` (`_io_completions`, `_io_starts`) | `/api/io/simulate` | I/O and resources, Trace | `test_io_block_and_interrupt`, `test_device_queue_contention`, `test_two_lab_units_parallel` |
| 8 | Banker's safety and request, deadlock detection | `engine/resources.py` | `/api/resources/safety-check`, `/api/resources/deadlock-check` | I/O and resources | `test_banker_*`, `test_deadlock_detection` |
| 9 | Race condition, mutex, semaphore | `engine/sync.py` (`race_demo`, `Mutex`, `Semaphore`) | `/api/sync/race-demo` | Sync lab | `test_race_*`, `test_issue_race`, `test_mutex_and_semaphore_primitives` |
| 10 | Producer-consumer bounded buffer | `engine/sync.py` (`producer_consumer`) | `/api/producer-consumer` | Sync lab | `test_producer_consumer_*` |
| 11 | Execution trace (time, actor, reason), filterable | `engine/trace.py`, `frontend/src/lib/trace.js` | `trace` in results, `/api/session/{id}/trace?patient=` | Trace, Timeline | `test_trace_*`, `test_trace_covers_every_transition`, vitest `trace filter` |

## Metric definitions (`engine/metrics.py`)
- Turnaround = completion - arrival
- Waiting = turnaround - burst - blocked time. Time BLOCKED (device service plus device queue) is
  excluded because the patient is not waiting for a doctor. Context-switch overhead is included.
- Response = first minute actually with a doctor - arrival
- READY wait = total time in the READY queue. Starved means READY wait > threshold.
- Throughput = completed / makespan, where makespan = last completion - first arrival
- Utilization = doctor busy minutes / makespan (switch overhead is not busy time)
- Fairness ratio = max wait / average wait (1.0 means everyone waited equally; 1.0 if nobody waited)

Each concept also has a summary and three viva questions in [VIVA.md](VIVA.md).
