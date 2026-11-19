# 5-minute demo script

Before: `make backend` and `make frontend` in two terminals, then open http://127.0.0.1:5173.

**0:00 to 0:30. Framing (Dashboard).** "Patients are processes, doctors are CPUs, the lab is an I/O device.
Everything runs on a deterministic integer clock." Point at the disclaimer in the top bar.

**0:30 to 1:30. Live session (Dashboard).** Start session with the default workload (preemptive priority, 2 doctors).
Press Step 1 min a few times: READY queues, doctors and the process table change. Add a P1 walk-in and step once:
it goes straight to a doctor, preempting the lowest-priority running patient if both doctors are busy.
Point at "Latest events" for the DISPATCH or PREEMPT reason in plain words.

**1:30 to 2:30. Convoy effect (Compare).** Load "Convoy effect", press Compare. FCFS average wait is about 22.7 min;
SRTF about 4.7 and RR about 8.1. Viva point: SJF does not help here because the long patient has already started and SJF never preempts.
Show the starred best values and the context-switch chart (RR pays with more switches).

**2:30 to 3:30. Starvation and aging (Starvation and aging lab).** Load "Emergency surge", run. Without aging 4 routine
patients starve (longest READY wait 57 min); with aging only 1 does (30 min) and R1 to R3 are rescued. Scroll to the aging events:
"R1 has waited 4 min: priority aged P5 -> P4".

**3:30 to 4:15. Timeline (Simulator, then Timeline).** In Simulator load "OPD morning rush", choose Round robin, Run, open Timeline.
Reset, then Next event a few times: each decision is explained ("Round Robin: P03 is next in the circular queue...").
Show the ↻ quantum marks and drag the scrubber.

**4:15 to 5:00. Resources and sync (I/O and resources, Sync lab).** Banker's: Check safety gives the safe sequence Cardiac, Pediatrics,
General, Trauma, Maternity. Request General ward (3,3,0) is denied as unsafe. Detect deadlock finds 4 stuck units.
Sync lab: Lock off shows token 1 served by C1 and C2; switch to Mutex and every token is served once.

Backup questions: see docs/VIVA.md (33 Q&As).
