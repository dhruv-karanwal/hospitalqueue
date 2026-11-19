"""Exact scheduling metrics.

Per patient (completed):
    turnaround = completion - arrival
    waiting    = turnaround - burst - blocked_time
                 (time BLOCKED on lab/X-ray/pharmacy, including the device queue,
                  is NOT counted as waiting for a doctor; context-switch overhead IS)
    response   = first_start - arrival   (first minute actually with a doctor)
    ready_wait = total time in the READY queue (used for starvation detection)
"""
from __future__ import annotations

LOWER_IS_BETTER = ("avg_waiting", "avg_turnaround", "avg_response", "max_wait",
                   "context_switches", "starvation_count", "fairness_ratio")
HIGHER_IS_BETTER = ("throughput", "utilization")


def _r(x: float) -> float:
    return round(x, 3)


def patient_row(p, threshold: int) -> dict:
    done = p.completion is not None
    tat = p.completion - p.arrival if done else None
    wait = tat - p.burst - p.blocked_time if done else None
    resp = p.first_start - p.arrival if p.first_start is not None else None
    return {
        "id": p.pid, "name": p.name, "arrival": p.arrival, "burst": p.burst,
        "priority": p.priority, "final_priority": p.eff_priority, "triage": p.triage,
        "state": p.state, "first_start": p.first_start, "completion": p.completion,
        "turnaround": tat, "waiting": wait, "response": resp, "ready_wait": p.ready_wait,
        "blocked_time": p.blocked_time, "preemptions": p.preemptions,
        "starved": p.ready_wait > threshold,
    }


def aggregate(rows: list[dict], busy: list[int], context_switches: int, preemptions: int,
              interrupts: int) -> dict:
    done = [r for r in rows if r["completion"] is not None]
    n = len(done)
    base = {"completed": n, "total": len(rows), "context_switches": context_switches,
            "preemptions": preemptions, "interrupts": interrupts}
    if n == 0:
        return {**base, "avg_turnaround": 0.0, "avg_waiting": 0.0, "avg_response": 0.0,
                "max_wait": 0, "throughput": 0.0, "utilization": 0.0, "doctor_utilization": [0.0] * len(busy),
                "starvation_count": 0, "fairness_ratio": 1.0, "makespan": 0}
    start = min(r["arrival"] for r in rows)
    makespan = max(r["completion"] for r in done) - start
    avg_wait = sum(r["waiting"] for r in done) / n
    max_wait = max(r["waiting"] for r in done)
    per_doc = [_r(b / makespan) if makespan else 0.0 for b in busy]
    return {
        **base,
        "avg_turnaround": _r(sum(r["turnaround"] for r in done) / n),
        "avg_waiting": _r(avg_wait),
        "avg_response": _r(sum(r["response"] for r in done) / n),
        "max_wait": max_wait,
        "throughput": _r(n / makespan) if makespan else 0.0,
        "utilization": _r(sum(busy) / (makespan * len(busy))) if makespan else 0.0,
        "doctor_utilization": per_doc,
        "starvation_count": sum(1 for r in rows if r["starved"]),
        "fairness_ratio": _r(max_wait / avg_wait) if avg_wait > 0 else 1.0,
        "makespan": makespan,
    }


def best_per_metric(results: list[dict]) -> dict[str, list[str]]:
    """For each metric, the policies achieving the best value (ties included)."""
    best: dict[str, list[str]] = {}
    for key in LOWER_IS_BETTER + HIGHER_IS_BETTER:
        vals = [(r["metrics"][key], r["policy"]) for r in results]
        if not vals:
            continue
        target = (min if key in LOWER_IS_BETTER else max)(v for v, _ in vals)
        best[key] = [p for v, p in vals if v == target]
    return best
