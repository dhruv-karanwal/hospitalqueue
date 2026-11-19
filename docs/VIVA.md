# Viva questions and answers

Generated from `frontend/src/lib/concepts.js` by `node scripts/gen-viva.mjs`. The same content is on the Concepts and viva page.

## Process management and the PCB

Each patient is a process. Its Process Control Block (PCB) holds the token, arrival, burst (consultation minutes), priority, remaining time, state and timing fields. States are NEW, READY, RUNNING, BLOCKED and TERMINATED, and every change goes through one validated function, so an illegal move such as NEW to RUNNING raises an error.

- **See it in:** Dashboard (process table), Trace (state history)
- **Code:** `backend/app/engine/pcb.py`, `backend/app/engine/simulator.py (_set_state, check_invariants)`

**Q1. What does a PCB contain here?**

Identity (token, name), scheduling data (arrival, burst, priority, effective priority, remaining time), state, accounting (ready wait, blocked time, first start, completion) and I/O progress.

**Q2. Why validate transitions?**

It catches bugs early: for example a BLOCKED patient can only return to READY, never straight to RUNNING. Tests try every illegal transition.

**Q3. How do you know the READY queue matches the process table?**

In test mode, after every minute the simulator checks that the set of READY patients equals the set of live entries in the ready queues, and that no patient is on two doctors.

## CPU scheduling policies

Doctors are CPUs. The scheduler picks the next patient using FCFS, SJF (non-preemptive), SRTF (preemptive), Priority (preemptive or not), Round Robin with a configurable quantum, or Priority with aging. Ties are broken by arrival time and then input order, so results are deterministic.

- **See it in:** Simulator, Timeline, Compare
- **Code:** `backend/app/engine/simulator.py (_key, _dispatch, _preempt, _quantum)`, `backend/app/engine/queues.py`

**Q1. Which policy minimises average waiting time?**

SJF is optimal among non-preemptive policies and SRTF among preemptive ones for average waiting, but both need the burst length in advance and can starve long jobs.

**Q2. How is the ready queue implemented?**

As a binary heap with lazy deletion. Push, pop and peek are O(log n). FCFS and RR use a constant key, so the insertion counter gives FIFO order.

**Q3. What happens when the RR quantum is too large or too small?**

Too large and RR behaves like FCFS. Too small and context switches dominate. You can see this on Compare by changing the quantum and the switch cost.

## Preemption and context switching

Under SRTF, preemptive Priority and Aging, a better patient interrupts the running one, for example a critical arrival during a routine consultation. A context switch is counted whenever a doctor starts a patient other than the one it last ran. A configurable switch cost adds idle overhead minutes, drawn as hatched blocks.

- **See it in:** Timeline (lightning marks, hatched switches), Compare (context switches)
- **Code:** `backend/app/engine/simulator.py (_preempt_doctor, _dispatch, _execute)`

**Q1. Is the first patient of a doctor a context switch?**

No. A switch is counted only when the doctor already ran a different patient, so it has to save one context and load another.

**Q2. Where does switch overhead go in the metrics?**

It counts as waiting for the incoming patient (it has not started yet) and is reported separately as switch_overhead. It is not counted as doctor busy time.

**Q3. Can a patient be preempted during a context switch?**

No. The switch is treated as atomic. Preemption is checked only for doctors that are actually running a patient.

## Starvation and aging

Starvation is a patient waiting in READY longer than a threshold. With aging, every aging interval of waiting raises the effective priority by the aging step (5 to 4 to ... to 1). The boost is kept until the patient finishes, so low-priority patients eventually win.

- **See it in:** Starvation and Aging Lab
- **Code:** `backend/app/engine/simulator.py (_arm_timers, _timers)`, `backend/app/engine/analysis.py (aging_demo)`

**Q1. How is aging implemented efficiently?**

Each READY patient gets a timer for its next boost. When it fires, the patient is re-pushed into the heap with its new key and the old entry is lazily discarded. There is no full scan every minute.

**Q2. How do you detect starvation?**

A timer fires the moment a patient's total READY time exceeds the threshold and logs a STARVATION event. The final report flags every patient whose ready wait is over the threshold.

**Q3. Does aging hurt critical patients?**

Slightly. An aged routine patient can tie with a critical one and win on earlier arrival. The lab shows the trade-off: a much lower maximum wait for a small change in average wait.

## Convoy effect

Under FCFS, one long consultation at the front makes every short patient behind it wait, like cars stuck behind a slow truck. The "Convoy effect" preset puts a 24-minute consultation first.

- **See it in:** Compare (load "Convoy effect"), Timeline
- **Code:** `backend/app/engine/scenarios.py (_convoy)`

**Q1. Why is FCFS average wait so high in the convoy preset?**

All six short patients wait for most of the 24 minutes. Preempting the long one (SRTF) or time-slicing (RR) lets them leave early.

**Q2. Does the convoy effect affect throughput?**

Not the total time for one doctor, which is always the sum of bursts, but it delays completions and lowers device utilization when short jobs would have gone on to I/O.

**Q3. Why does SJF not fix this convoy?**

The long patient arrives alone at minute 0 and starts. SJF is non-preemptive, so it only reorders the short patients behind it. SJF fixes a convoy only when the short jobs are already waiting when the choice is made (try the textbook set where all arrive at 0).

## Multi-doctor scheduling

N doctors run in parallel. In global mode there is one common queue and any free doctor takes the next patient. In per-doctor mode each patient joins the shortest line on arrival and stays with that doctor. The comparison shows the load imbalance of separate lines.

- **See it in:** Multi-doctor
- **Code:** `backend/app/engine/simulator.py (queue_mode, _arrivals, _preempt)`, `backend/app/engine/analysis.py (queue_mode_compare)`

**Q1. Why is a single common queue usually better?**

No doctor sits idle while patients wait in another line, which is the same reason a bank uses one queue for many tellers.

**Q2. What is the advantage of per-doctor queues?**

Affinity: a patient keeps the same doctor (like cache affinity on a CPU), and each queue needs no shared lock.

**Q3. How does preemption work with a global queue?**

The waiting patient is compared with the worst running patient across all doctors, and that doctor is the one preempted.

## I/O management and interrupts

A patient can be sent for a lab test, X-ray or pharmacy visit partway through a consultation. It becomes BLOCKED and joins that device's FIFO queue, and the doctor is freed. When the device finishes, a completion interrupt moves the patient back to READY.

- **See it in:** I/O and Resources, Trace (Interrupt filter)
- **Code:** `backend/app/engine/simulator.py (_io_completions, _io_starts, _execute)`

**Q1. Is time spent BLOCKED counted as waiting?**

No. Waiting = turnaround - burst - blocked time, so waiting means waiting for a doctor. Blocked time, including the device queue, is reported separately.

**Q2. What happens if two patients need the only lab unit?**

The second waits in the lab's FIFO device queue (still BLOCKED) and starts when the first finishes.

**Q3. Why does I/O improve utilization?**

While one patient is at the lab, the doctor serves someone else: CPU and I/O overlap.

## Resource allocation and deadlock avoidance

Beds, ambulances and lab devices are limited. The Banker's safety algorithm grants a request only if a safe sequence still exists in which every unit can finish. A separate detection algorithm uses the current request matrix to find units that are already deadlocked.

- **See it in:** I/O and Resources (Banker's)
- **Code:** `backend/app/engine/resources.py`

**Q1. What is a safe state?**

A state where some order of the processes lets each one get its remaining need from what is available plus what earlier ones release.

**Q2. Is an unsafe state a deadlock?**

Not necessarily. It means deadlock is possible. Banker's avoids unsafe states altogether. Detection finds deadlocks that already exist.

**Q3. What are the three outcomes of a request?**

An error if it exceeds the declared maximum, a wait if it exceeds what is available now, otherwise it is tentatively granted and kept only if the new state is safe.

## Synchronization: race condition, mutex and semaphore

Two counters read the shared "now serving" number, serve it and write it back plus one. Interleaved without a lock, both read the same value and serve the same token (a lost update). With a mutex or a binary semaphore around the read-serve-write critical section, each token is served exactly once.

- **See it in:** Sync Lab (race demo)
- **Code:** `backend/app/engine/sync.py (race_demo, Mutex, Semaphore)`

**Q1. What exactly goes wrong without the lock?**

Read-modify-write is not atomic. C1 reads 1, C2 reads 1, both serve token 1 and both write 2, so token 1 is served twice.

**Q2. Mutex or semaphore, what is the difference?**

A mutex has an owner and only the owner may unlock it. A semaphore is a counter with wait and signal that any thread may signal. Binary semaphore = 1 behaves like a lock here.

**Q3. Why is the demo deterministic?**

Instructions are interleaved round-robin one at a time, which is the worst case for races, so the bug always shows and tests can assert it.

## Producer-consumer (bounded buffer)

Reception (producer) puts arriving patients into a waiting area with fixed capacity (the buffer). Counters (consumers) take them out. Semaphore empty counts free seats and full counts waiting patients: the producer blocks when the area is full and consumers block when it is empty.

- **See it in:** Sync Lab (buffer animation)
- **Code:** `backend/app/engine/sync.py (producer_consumer)`

**Q1. Which semaphores are used, and with what initial values?**

empty = capacity, full = 0, plus a mutex around buffer access. The invariant empty + full = capacity holds at every step, and tests check it.

**Q2. What happens when arrivals outpace counters?**

The buffer fills, the producer blocks and new arrivals wait at the door (the backlog). The animation shows producer-blocked minutes rising.

**Q3. What if the order of wait(empty) and wait(mutex) is swapped?**

The producer could hold the mutex while blocked on a full buffer, so no consumer can enter to free a seat. That is a deadlock.

## Execution trace

Every state change, scheduling decision, preemption, context switch, interrupt, aging boost and starvation alarm is an event with time, actor and a plain-language reason. You can filter the trace by patient, by event type or by text.

- **See it in:** Trace, Timeline (decision panel)
- **Code:** `backend/app/engine/trace.py`, `frontend/src/lib/trace.js`

**Q1. How do you prove the trace is complete?**

A test replays each patient's events and checks that each "to" state equals the next "from" state, from ARRIVAL to COMPLETE.

**Q2. Does tracing slow the simulator down?**

Slightly. Events are plain dicts appended to a list. 500 patients with tracing on still finish in well under 200 ms (see the benchmark).

**Q3. How is a long trace shown without lag?**

The list is virtualized (only visible rows are rendered) and the text search is debounced.

