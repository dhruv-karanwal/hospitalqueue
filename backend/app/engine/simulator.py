"""Deterministic discrete-time hospital scheduler (the "kernel").

Patients are processes, doctors are CPUs, lab/X-ray/pharmacy are I/O devices.
The clock is an integer; one step() simulates the minute [t, t+1).

Order of work inside one step at time t (fixed, so output is deterministic):
    1. I/O completion interrupts (BLOCKED -> READY)
    2. start queued I/O requests on free device units
    3. arrivals (NEW -> READY)
    4. timers: aging boosts and starvation alarms
    5. Round Robin quantum expiry
    6. dispatch idle doctors
    7. preemption (SRTF / Priority-preemptive / Priority+Aging)
    8. execute one minute on every busy doctor (or one minute of switch overhead)

Ties are always broken by (arrival time, input order). The engine keeps no
global state: Simulation objects are created per run and discarded.
"""
from __future__ import annotations

import heapq
from collections import deque
from dataclasses import dataclass, field

from .metrics import aggregate, patient_row
from .pcb import BLOCKED, NEW, READY, RUNNING, TERMINATED, PCB, PatientSpec, check_transition
from .queues import ReadyQueue
from .trace import Trace

POLICIES = ("FCFS", "SJF", "SRTF", "PRIORITY_NP", "PRIORITY_P", "RR", "PRIORITY_AGING")
POLICY_LABELS = {
    "FCFS": "First-Come First-Served", "SJF": "Shortest Job First (non-preemptive)",
    "SRTF": "Shortest Remaining Time First (preemptive)",
    "PRIORITY_NP": "Priority (non-preemptive)", "PRIORITY_P": "Priority (preemptive)",
    "RR": "Round Robin", "PRIORITY_AGING": "Priority + Aging (preemptive)",
}
PREEMPTIVE = frozenset({"SRTF", "PRIORITY_P", "PRIORITY_AGING"})
QUEUE_MODES = ("global", "per_doctor")
DEFAULT_DEVICES = (("lab", 1), ("xray", 1), ("pharmacy", 1))


class SimulationError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class SimConfig:
    policy: str = "FCFS"
    doctors: int = 1
    quantum: int = 2
    context_switch_cost: int = 0
    aging_interval: int = 5
    aging_step: int = 1
    starvation_threshold: int = 30
    queue_mode: str = "global"
    devices: tuple[tuple[str, int], ...] = DEFAULT_DEVICES
    include_trace: bool = True
    check_invariants: bool = False
    max_time: int = 1_000_000
    doctor_names: tuple[str, ...] = ()
    doctor_specialties: tuple[str | None, ...] = ()


@dataclass(slots=True)
class Doctor:
    id: int
    name: str
    specialty: str | None = None
    current: int | None = None
    switch_left: int = 0
    quantum_used: int = 0
    last: int | None = None
    busy: int = 0
    switch_ticks: int = 0
    seg: dict | None = None


@dataclass(slots=True)
class Device:
    name: str
    order: int
    units: int
    free: list[int] = field(default_factory=list)
    queue: deque = field(default_factory=deque)
    requests: int = 0
    busy: int = 0
    max_queue: int = 0


class Simulation:
    def __init__(self, specs: list[PatientSpec], cfg: SimConfig) -> None:
        if cfg.policy not in POLICIES:
            raise SimulationError(f"unknown policy {cfg.policy!r}")
        if cfg.queue_mode not in QUEUE_MODES:
            raise SimulationError(f"unknown queue mode {cfg.queue_mode!r}")
        if cfg.doctors < 1:
            raise SimulationError("need at least one doctor")
        self.cfg = cfg
        self.t = 0
        self.preemptive = cfg.policy in PREEMPTIVE
        self.aging = cfg.policy == "PRIORITY_AGING"
        self.global_q = cfg.queue_mode == "global"
        self.P: list[PCB] = []
        self._ids: set[str] = set()
        self.doctors = [
            Doctor(i, cfg.doctor_names[i] if i < len(cfg.doctor_names) else f"D{i + 1}",
                   cfg.doctor_specialties[i] if i < len(cfg.doctor_specialties) else None)
            for i in range(cfg.doctors)
        ]
        self.queues = [ReadyQueue() for _ in range(1 if self.global_q else cfg.doctors)]
        self.devlist = [Device(n, i, u, list(range(u))) for i, (n, u) in enumerate(cfg.devices)]
        self.dev = {d.name: d for d in self.devlist}
        self.arrivals: list[tuple[int, int]] = []
        self.timers: list[tuple[int, int, int, int]] = []
        self.io_done: list[tuple[int, int, int, int]] = []
        self.trace = Trace(cfg.include_trace)
        self.gantt: list[dict] = []
        self.device_gantt: list[dict] = []
        self.done_count = 0
        self.context_switches = 0
        self.preemptions = 0
        self.quantum_expiries = 0
        self.interrupts = 0
        self.starvation_alarms = 0
        for s in specs:
            self.add_patient(s)

    # ------------------------------------------------------------------ input
    def add_patient(self, spec: PatientSpec) -> None:
        if spec.id in self._ids:
            raise SimulationError(f"duplicate patient id {spec.id!r}")
        if spec.arrival < self.t:
            raise SimulationError(f"{spec.id}: arrival {spec.arrival} is before the clock ({self.t})")
        if spec.burst < 1:
            raise SimulationError(f"{spec.id}: burst must be >= 1")
        if spec.doctor is not None and not 1 <= spec.doctor <= self.cfg.doctors:
            raise SimulationError(f"{spec.id}: preferred doctor {spec.doctor} does not exist")
        last = 0
        for r in sorted(spec.io, key=lambda r: r.at):
            if r.device not in self.dev:
                raise SimulationError(f"{spec.id}: unknown device {r.device!r}")
            if not 0 < r.at < spec.burst or r.at <= last:
                raise SimulationError(f"{spec.id}: I/O 'at' values must be increasing and inside (0, burst)")
            last = r.at
        p = PCB.from_spec(spec, len(self.P))
        self.P.append(p)
        self._ids.add(spec.id)
        heapq.heappush(self.arrivals, (p.arrival, p.idx))

    # ---------------------------------------------------------------- helpers
    def _key(self, p: PCB) -> tuple:
        pol = self.cfg.policy
        if pol in ("FCFS", "RR"):
            return (0,)                       # FIFO: insertion counter decides
        if pol in ("SJF", "SRTF"):
            return (p.remaining, p.arrival, p.idx)
        return (p.eff_priority, p.arrival, p.idx)

    def _qi(self, p: PCB) -> int:
        return 0 if self.global_q else p.home

    def _dq(self, d: Doctor) -> int:
        return 0 if self.global_q else d.id

    def _qname(self, qi: int) -> str:
        return "the common queue" if self.global_q else f"{self.doctors[qi].name}'s queue"

    def _set_state(self, p: PCB, new: str, t: int, etype: str, reason: str, actor: str,
                   doctor: Doctor | None = None) -> None:
        old = p.state
        check_transition(old, new)
        if old == READY:
            p.ready_wait += t - p.ready_since
        elif old == BLOCKED:
            p.blocked_time += t - p.blocked_since
        p.state = new
        if new == READY:
            p.ready_since = t
            p.epoch += 1
            self.queues[self._qi(p)].push(self._key(p), p.idx)
            self._arm_timers(p, t)
        elif new == BLOCKED:
            p.blocked_since = t
        elif new == TERMINATED:
            p.completion = t
            self.done_count += 1
        self.trace.add(t, etype, actor, reason, p.pid, doctor.name if doctor else None, old, new)

    def _arm_timers(self, p: PCB, t: int) -> None:
        cfg = self.cfg
        if self.aging and p.eff_priority > 1:
            r = p.ready_wait % cfg.aging_interval
            heapq.heappush(self.timers, (t + cfg.aging_interval - r, 0, p.idx, p.epoch))
        if not p.starved_flagged and p.ready_wait <= cfg.starvation_threshold:
            heapq.heappush(self.timers, (t + cfg.starvation_threshold - p.ready_wait + 1, 1, p.idx, p.epoch))

    def _explain(self, p: PCB, n: int) -> str:
        pol, others = self.cfg.policy, n - 1
        if pol == "FCFS":
            return f"FCFS: {p.pid} is at the head of the queue (first come, first served; {others} others waiting)"
        if pol == "RR":
            return f"Round Robin: {p.pid} is next in the circular queue and may run up to {self.cfg.quantum} min ({others} others waiting)"
        if pol == "SJF":
            return f"SJF: {p.pid} has the shortest next consultation ({p.remaining} min) of {n} waiting; it will run to completion"
        if pol == "SRTF":
            return f"SRTF: {p.pid} has the shortest remaining time ({p.remaining} min) of {n} waiting"
        aged = f", aged up from P{p.priority}" if p.eff_priority < p.priority else ""
        tail = "" if pol != "PRIORITY_NP" else "; non-preemptive, runs to completion"
        return f"Priority: {p.pid} has the highest priority (P{p.eff_priority}{aged}) of {n} waiting{tail}"

    # ------------------------------------------------------------------ gantt
    def _seg(self, d: Doctor, p: PCB, kind: str, t: int) -> None:
        s = d.seg
        if s is not None and s["end"] == t and s["patient"] == p.pid and s["kind"] == kind:
            s["end"] = t + 1
            return
        if s is not None and s["end_reason"] is None:
            s["end_reason"] = "switch" if kind == "run" and s["kind"] == "switch" else s["end_reason"]
        d.seg = {"doctor": d.name, "patient": p.pid, "kind": kind, "start": t, "end": t + 1,
                 "priority": p.eff_priority, "end_reason": None}
        self.gantt.append(d.seg)

    def _close_seg(self, d: Doctor, reason: str) -> None:
        if d.seg is not None:
            d.seg["end_reason"] = reason
            d.seg = None

    # ------------------------------------------------------------- the step
    def _io_completions(self, t: int) -> None:
        while self.io_done and self.io_done[0][0] <= t:
            _, order, unit, idx = heapq.heappop(self.io_done)
            dev = self.devlist[order]
            heapq.heappush(dev.free, unit)
            p = self.P[idx]
            p.io_index += 1
            self.interrupts += 1
            self._set_state(p, READY, t, "INTERRUPT",
                            f"{dev.name} unit {unit + 1} finished for {p.pid}: completion interrupt, {p.pid} returns to {self._qname(self._qi(p))}",
                            actor=dev.name)

    def _io_starts(self, t: int) -> None:
        for dev in self.devlist:
            while dev.free and dev.queue:
                unit = heapq.heappop(dev.free)
                idx = dev.queue.popleft()
                p = self.P[idx]
                req = p.io[p.io_index]
                end = t + req.duration
                dev.busy += req.duration
                heapq.heappush(self.io_done, (end, dev.order, unit, idx))
                self.device_gantt.append({"device": dev.name, "unit": unit + 1, "patient": p.pid,
                                          "start": t, "end": end, "requested": p.blocked_since})
                self.trace.add(t, "IO_START", dev.name,
                               f"{dev.name} unit {unit + 1} starts {p.pid} ({req.duration} min); {len(dev.queue)} still in device queue",
                               p.pid)

    def _arrivals(self, t: int) -> None:
        while self.arrivals and self.arrivals[0][0] <= t:
            _, idx = heapq.heappop(self.arrivals)
            p = self.P[idx]
            if not self.global_q:
                if p.doctor_pref is not None:
                    p.home = p.doctor_pref - 1
                    how = "requested doctor"
                else:
                    p.home = min(range(len(self.doctors)),
                                 key=lambda i: (len(self.queues[i]) + (self.doctors[i].current is not None), i))
                    how = "shortest line"
            else:
                how = None
            where = self._qname(self._qi(p)) + (f" ({how})" if how else "")
            self._set_state(p, READY, t, "ARRIVAL",
                            f"{p.pid} arrives (P{p.priority} {p.triage}, needs {p.burst} min) and joins {where}",
                            actor="reception")

    def _timers(self, t: int) -> None:
        cfg = self.cfg
        while self.timers and self.timers[0][0] <= t:
            _, kind, idx, epoch = heapq.heappop(self.timers)
            p = self.P[idx]
            if p.state != READY or p.epoch != epoch:
                continue
            acc = p.ready_wait + (t - p.ready_since)
            if kind == 0:
                new = max(1, p.priority - cfg.aging_step * (acc // cfg.aging_interval))
                if new < p.eff_priority:
                    old, p.eff_priority = p.eff_priority, new
                    self.queues[self._qi(p)].push(self._key(p), idx)
                    self.trace.add(t, "AGING", "scheduler",
                                   f"{p.pid} has waited {acc} min: priority aged P{old} -> P{new}", p.pid)
                if p.eff_priority > 1:
                    heapq.heappush(self.timers, (t + cfg.aging_interval, 0, idx, epoch))
            else:
                p.starved_flagged = True
                self.starvation_alarms += 1
                self.trace.add(t, "STARVATION", "monitor",
                               f"{p.pid} has waited {acc} min in READY, over the starvation threshold of {cfg.starvation_threshold}",
                               p.pid)

    def _dispatch(self, d: Doctor, q: ReadyQueue, t: int) -> None:
        n = len(q)
        idx = q.pop()
        p = self.P[idx]
        reason = self._explain(p, n)
        if d.last is not None and d.last != idx:
            self.context_switches += 1
            d.switch_left = self.cfg.context_switch_cost
            cost = f" ({d.switch_left} min overhead)" if d.switch_left else ""
            self.trace.add(t, "CONTEXT_SWITCH", d.name,
                           f"{d.name} saves {self.P[d.last].pid}'s context and loads {p.pid}{cost}", p.pid, d.name)
        else:
            d.switch_left = 0
        d.current = idx
        d.quantum_used = 0
        p.doctor = d.id
        self._set_state(p, RUNNING, t, "DISPATCH", f"{reason} -> {d.name}", actor="scheduler", doctor=d)

    def _preempt_doctor(self, d: Doctor, t: int, kind: str, by: PCB | None = None) -> None:
        idx = d.current
        p = self.P[idx]
        self._close_seg(d, "quantum" if kind == "QUANTUM_EXPIRED" else "preempted")
        d.current = None
        d.last = idx
        p.preemptions += 1
        self.preemptions += 1
        if kind == "QUANTUM_EXPIRED":
            self.quantum_expiries += 1
            reason = f"{p.pid} used its {self.cfg.quantum}-min quantum on {d.name}; moved to the back of the queue ({p.remaining} min left)"
        elif self.cfg.policy == "SRTF":
            reason = f"{by.pid} needs {by.remaining} min, less than {p.pid}'s remaining {p.remaining} min: {p.pid} is preempted on {d.name}"
        else:
            reason = f"{by.pid} (P{by.eff_priority}) outranks running {p.pid} (P{p.eff_priority}): {p.pid} is preempted on {d.name}"
        self._set_state(p, READY, t, kind, reason, actor="scheduler", doctor=d)

    def _quantum(self, t: int) -> None:
        for d in self.doctors:
            if d.current is not None and d.switch_left == 0 and d.quantum_used >= self.cfg.quantum:
                if len(self.queues[self._dq(d)]):
                    self._preempt_doctor(d, t, "QUANTUM_EXPIRED")
                else:
                    d.quantum_used = 0       # nobody waiting: keep running, new quantum

    def _dispatch_idle(self, t: int) -> None:
        for d in self.doctors:
            if d.current is None:
                q = self.queues[self._dq(d)]
                if len(q):
                    self._dispatch(d, q, t)

    def _preempt(self, t: int) -> None:
        P, key = self.P, self._key
        if self.global_q:
            q = self.queues[0]
            while True:
                top = q.peek()
                if top is None:
                    return
                cands = [d for d in self.doctors if d.current is not None and d.switch_left == 0]
                if not cands:
                    return
                worst = max(cands, key=lambda d: (key(P[d.current]), d.id))
                if key(P[top])[0] < key(P[worst.current])[0]:
                    self._preempt_doctor(worst, t, "PREEMPT", by=P[top])
                    self._dispatch(worst, q, t)
                else:
                    return
        else:
            for d in self.doctors:
                if d.current is None or d.switch_left:
                    continue
                q = self.queues[d.id]
                top = q.peek()
                if top is not None and key(P[top])[0] < key(P[d.current])[0]:
                    self._preempt_doctor(d, t, "PREEMPT", by=P[top])
                    self._dispatch(d, q, t)

    def _execute(self, t: int) -> None:
        for d in self.doctors:
            idx = d.current
            if idx is None:
                continue
            p = self.P[idx]
            if d.switch_left > 0:
                d.switch_left -= 1
                d.switch_ticks += 1
                self._seg(d, p, "switch", t)
                continue
            if p.first_start is None:
                p.first_start = t
            p.remaining -= 1
            p.executed += 1
            d.busy += 1
            d.quantum_used += 1
            self._seg(d, p, "run", t)
            if p.remaining == 0:
                self._close_seg(d, "completed")
                d.current = None
                d.last = idx
                self._set_state(p, TERMINATED, t + 1, "COMPLETE",
                                f"{p.pid} finished with {d.name} (turnaround {t + 1 - p.arrival} min)",
                                actor=d.name, doctor=d)
            elif p.io_index < len(p.io) and p.executed == p.io[p.io_index].at:
                req = p.io[p.io_index]
                self._close_seg(d, "io")
                d.current = None
                d.last = idx
                self._set_state(p, BLOCKED, t + 1, "IO_REQUEST",
                                f"{p.pid} sent for {req.device} ({req.duration} min): BLOCKED, {d.name} is freed",
                                actor=d.name, doctor=d)
                dev = self.dev[req.device]
                dev.queue.append(idx)
                dev.requests += 1
                dev.max_queue = max(dev.max_queue, len(dev.queue))

    def step(self) -> None:
        t = self.t
        self._io_completions(t)
        self._io_starts(t)
        self._arrivals(t)
        self._timers(t)
        if self.cfg.policy == "RR":
            self._quantum(t)
        self._dispatch_idle(t)
        if self.preemptive:
            self._preempt(t)
        self._execute(t)
        self.t = t + 1
        if self.cfg.check_invariants:
            self.check_invariants()

    # ---------------------------------------------------------------- driving
    def finished(self) -> bool:
        return self.done_count == len(self.P) and not self.arrivals

    def _skip_idle(self) -> None:
        """Jump the clock over periods where nothing can happen (no busy-waiting)."""
        if any(d.current is not None for d in self.doctors) or any(len(q) for q in self.queues):
            return
        if any(dev.queue and dev.free for dev in self.devlist):
            return
        nxt = [e[0][0] for e in (self.arrivals, self.io_done) if e]
        if nxt and min(nxt) > self.t:
            self.t = min(nxt)

    def run(self) -> dict:
        limit = self.cfg.max_time
        while not self.finished():
            self._skip_idle()
            if self.t > limit:
                raise SimulationError(f"simulation exceeded {limit} time units")
            self.step()
        return self.result()

    def advance(self, ticks: int) -> None:
        """Live mode: advance exactly `ticks` minutes. The clock keeps running even when
        the hospital is idle, so patients can still be added later."""
        for _ in range(ticks):
            self.step()

    # ---------------------------------------------------------------- checks
    def check_invariants(self) -> None:
        P = self.P
        ready = {p.idx for p in P if p.state == READY}
        inq: set[int] = set()
        for q in self.queues:
            ids = q.ids()
            assert not (ids & inq), "patient in two ready queues"
            inq |= ids
        assert ready == inq, f"READY set {ready} != queue contents {inq}"
        running = [d.current for d in self.doctors if d.current is not None]
        assert len(running) == len(set(running)), "patient on two doctors at once"
        assert set(running) == {p.idx for p in P if p.state == RUNNING}, "RUNNING mismatch"
        blocked = {i for dev in self.devlist for i in dev.queue} | {e[3] for e in self.io_done}
        assert blocked == {p.idx for p in P if p.state == BLOCKED}, "BLOCKED mismatch"
        for p in P:
            assert p.remaining + p.executed == p.burst and p.remaining >= 0, "burst not conserved"
            assert p.state != NEW or p.arrival >= self.t, "arrived patient still NEW"

    # ---------------------------------------------------------------- output
    def result(self) -> dict:
        thr = self.cfg.starvation_threshold
        rows = [patient_row(p, thr) for p in self.P]
        m = aggregate(rows, [d.busy for d in self.doctors], self.context_switches,
                      self.preemptions, self.interrupts)
        m["quantum_expiries"] = self.quantum_expiries
        m["switch_overhead"] = sum(d.switch_ticks for d in self.doctors)
        return {
            "policy": self.cfg.policy,
            "policy_label": POLICY_LABELS[self.cfg.policy],
            "queue_mode": self.cfg.queue_mode,
            "clock": self.t,
            "doctors": [{"id": d.name, "specialty": d.specialty, "busy": d.busy,
                         "switch_overhead": d.switch_ticks,
                         "utilization": m["doctor_utilization"][d.id]} for d in self.doctors],
            "devices": [{"name": dv.name, "units": dv.units, "requests": dv.requests,
                         "busy": dv.busy, "max_queue": dv.max_queue} for dv in self.devlist],
            "gantt": self.gantt,
            "device_gantt": self.device_gantt,
            "patients": rows,
            "metrics": m,
            "trace": self.trace.events,
        }

    def snapshot(self) -> dict:
        """Live view of the process table, queues, doctors and devices."""
        P = self.P
        doctors = []
        for d in self.doctors:
            cur = P[d.current] if d.current is not None else None
            doctors.append({"id": d.name, "specialty": d.specialty,
                            "status": "idle" if cur is None else ("switching" if d.switch_left else "busy"),
                            "patient": cur.pid if cur else None,
                            "remaining": cur.remaining if cur else None,
                            "priority": cur.eff_priority if cur else None,
                            "quantum_used": d.quantum_used if cur else 0, "busy": d.busy})
        queues = [{"name": "Common queue" if self.global_q else self.doctors[i].name,
                   "patients": [P[i2].pid for i2 in q.ordered()]} for i, q in enumerate(self.queues)]
        devices = []
        in_service = {e[3]: self.devlist[e[1]].name for e in self.io_done}
        for dv in self.devlist:
            devices.append({"name": dv.name, "units": dv.units, "free": len(dv.free),
                            "queue": [P[i].pid for i in dv.queue],
                            "in_service": [P[i].pid for i, n in in_service.items() if n == dv.name]})
        table = [{"id": p.pid, "state": p.state, "arrival": p.arrival, "burst": p.burst,
                  "remaining": p.remaining, "priority": p.priority, "eff_priority": p.eff_priority,
                  "doctor": self.doctors[p.doctor].name if p.doctor is not None else None,
                  "ready_wait": p.ready_wait + (self.t - p.ready_since if p.state == READY else 0),
                  "completion": p.completion} for p in P]
        res = self.result()
        return {"clock": self.t, "finished": self.finished(), "policy": self.cfg.policy,
                "queue_mode": self.cfg.queue_mode, "doctors": doctors, "queues": queues,
                "devices": devices, "process_table": table, "metrics": res["metrics"],
                "gantt": res["gantt"]}


def simulate(specs: list[PatientSpec], cfg: SimConfig) -> dict:
    """Pure entry point: same input -> same output."""
    return Simulation(specs, cfg).run()
