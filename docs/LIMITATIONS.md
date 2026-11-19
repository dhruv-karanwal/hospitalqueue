# Limitations

- **Not a clinical system.** It evaluates queue policies on synthetic or user-entered data. Priority
  levels are human inputs; nothing here performs triage or gives medical advice.
- **Integer minutes.** The clock is discrete. Events inside a minute are ordered by a fixed rule
  (interrupts, then arrivals, then timers, then dispatch). Real hospitals are continuous and noisy.
- **Known burst times.** SJF and SRTF use the declared consultation length, the classic
  "oracle" assumption. No burst prediction (for example exponential averaging) is modelled.
- **Doctors are identical.** `specialty` is accepted for display only; no skill matching or routing by specialty.
- **Per-doctor mode** uses "join the shortest line by head count" with no switching lines (no jockeying).
  On some workloads this does as well as a common FCFS queue. The government-service preset is chosen to show the usual case where it does worse.
- **Aging** boosts are kept until the patient finishes (no reset on dispatch). Other textbooks reset them.
- **Context switch** is counted whenever a doctor starts a patient other than the one it last ran,
  including after a completion; the very first patient of each doctor is free.
- **I/O** devices serve their queues FIFO and are not preemptible. Lab results do not change the remaining consultation time.
- **Banker's algorithm** works on matrices you enter; it is not wired into the patient simulation
  (beds and ambulances are not allocated automatically to simulated patients).
- **Race demo** interleaves one instruction at a time in round-robin order (the worst case). It shows
  the bug deterministically but does not explore every possible interleaving.
- **Live sessions** live in memory (max 32, oldest evicted) and are lost when the backend restarts.
  Saved scenarios and run history are stored in SQLite.
- **Scale limits** enforced by validation: up to 1000 patients, burst up to 1000, total burst up to 100,000 minutes,
  20 doctors, 10 units per device, 300 patients per live session.
