"""Process Control Block (PCB) for a patient and the validated process state machine.

A patient is modelled as a process:
    NEW -> READY -> RUNNING -> TERMINATED
                 ^      |  \
                 |      v   -> READY (preempted / quantum expired)
                 +-- BLOCKED (waiting for lab / X-ray / pharmacy)
"""
from __future__ import annotations

from dataclasses import dataclass

NEW, READY, RUNNING, BLOCKED, TERMINATED = "NEW", "READY", "RUNNING", "BLOCKED", "TERMINATED"
STATES = (NEW, READY, RUNNING, BLOCKED, TERMINATED)

TRANSITIONS: dict[str, frozenset[str]] = {
    NEW: frozenset({READY}),
    READY: frozenset({RUNNING}),
    RUNNING: frozenset({READY, BLOCKED, TERMINATED}),
    BLOCKED: frozenset({READY}),
    TERMINATED: frozenset(),
}

# Labels only; the numeric priority is always a human (triage nurse) input.
TRIAGE = {1: "Resuscitation", 2: "Emergent", 3: "Urgent", 4: "Less urgent", 5: "Non-urgent"}


class InvalidTransition(ValueError):
    """Raised when code attempts an illegal process state change."""


def check_transition(current: str, new: str) -> None:
    if new not in TRANSITIONS[current]:
        raise InvalidTransition(f"illegal transition {current} -> {new}")


@dataclass(frozen=True, slots=True)
class IORequest:
    at: int          # CPU minutes completed before the request is issued (0 < at < burst)
    device: str      # "lab" | "xray" | "pharmacy"
    duration: int    # device service time


@dataclass(frozen=True, slots=True)
class PatientSpec:
    """Immutable input description of one patient (process)."""
    id: str
    arrival: int
    burst: int
    priority: int = 3
    name: str = ""
    triage: str | None = None
    doctor: int | None = None          # optional preferred doctor (1-based), per-doctor mode only
    io: tuple[IORequest, ...] = ()


@dataclass(slots=True)
class PCB:
    """Mutable runtime state of a patient inside one simulation."""
    idx: int
    pid: str
    name: str
    arrival: int
    burst: int
    priority: int
    triage: str
    doctor_pref: int | None
    io: tuple[IORequest, ...]
    state: str = NEW
    remaining: int = 0
    executed: int = 0
    eff_priority: int = 0
    first_start: int | None = None
    completion: int | None = None
    ready_since: int = 0
    ready_wait: int = 0
    blocked_since: int = 0
    blocked_time: int = 0
    io_index: int = 0
    home: int = 0
    epoch: int = 0
    doctor: int | None = None
    preemptions: int = 0
    starved_flagged: bool = False

    @classmethod
    def from_spec(cls, spec: PatientSpec, idx: int) -> "PCB":
        return cls(
            idx=idx, pid=spec.id, name=spec.name or spec.id, arrival=spec.arrival,
            burst=spec.burst, priority=spec.priority,
            triage=spec.triage or TRIAGE.get(spec.priority, "Unknown"),
            doctor_pref=spec.doctor, io=tuple(sorted(spec.io, key=lambda r: r.at)),
            remaining=spec.burst, eff_priority=spec.priority,
        )

    def transition(self, new: str) -> None:
        check_transition(self.state, new)
        self.state = new
