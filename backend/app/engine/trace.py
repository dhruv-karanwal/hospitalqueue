"""Execution trace: every state change and scheduling decision is an event."""
from __future__ import annotations


class Trace:
    __slots__ = ("events", "enabled")

    def __init__(self, enabled: bool = True) -> None:
        self.events: list[dict] = []
        self.enabled = enabled

    def add(self, t: int, type_: str, actor: str, reason: str, patient: str | None = None,
            doctor: str | None = None, frm: str | None = None, to: str | None = None) -> None:
        if self.enabled:
            self.events.append({"t": t, "type": type_, "actor": actor, "patient": patient,
                                "doctor": doctor, "from": frm, "to": to, "reason": reason})


def filter_events(events: list[dict], patient: str | None = None, types: set[str] | None = None,
                  text: str | None = None) -> list[dict]:
    needle = text.lower() if text else None
    out = []
    for e in events:
        if patient and e["patient"] != patient:
            continue
        if types and e["type"] not in types:
            continue
        if needle and needle not in e["reason"].lower() and needle not in e["actor"].lower():
            continue
        out.append(e)
    return out
