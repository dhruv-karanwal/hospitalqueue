"""Resource allocation: Banker's safety algorithm, request check and deadlock detection.

Processes are wards / dispatch teams; resources are beds, ambulances, lab devices.
All functions are pure and deterministic (scan in index order, repeated passes).
"""
from __future__ import annotations


def _le(a: list[int], b: list[int]) -> bool:
    return all(x <= y for x, y in zip(a, b))


def _add(a: list[int], b: list[int]) -> list[int]:
    return [x + y for x, y in zip(a, b)]


def _validate(available, maximum, allocation) -> None:
    m = len(available)
    if any(v < 0 for v in available):
        raise ValueError("available must be non-negative")
    if len(maximum) != len(allocation):
        raise ValueError("max and allocation must have the same number of processes")
    for i, (mx, al) in enumerate(zip(maximum, allocation)):
        if len(mx) != m or len(al) != m:
            raise ValueError(f"row {i} has the wrong number of resource types")
        if any(x < 0 for x in mx + al):
            raise ValueError("matrices must be non-negative")
        if not _le(al, mx):
            raise ValueError(f"process {i} holds more than its declared maximum")


def need_matrix(maximum, allocation) -> list[list[int]]:
    return [[m - a for m, a in zip(mx, al)] for mx, al in zip(maximum, allocation)]


def safety(available: list[int], maximum: list[list[int]], allocation: list[list[int]]) -> dict:
    """Banker's safety algorithm. Returns safe flag, safe sequence and every step."""
    _validate(available, maximum, allocation)
    need = need_matrix(maximum, allocation)
    n = len(need)
    work = list(available)
    finish = [False] * n
    seq, steps = [], []
    progress = True
    while progress:
        progress = False
        for i in range(n):
            if not finish[i] and _le(need[i], work):
                before = work
                work = _add(work, allocation[i])
                finish[i] = True
                seq.append(i)
                steps.append({"process": i, "need": need[i], "work_before": before, "work_after": work})
                progress = True
    return {"safe": all(finish), "sequence": seq, "need": need, "steps": steps,
            "unfinished": [i for i in range(n) if not finish[i]]}


def request_resources(available, maximum, allocation, process: int, request: list[int]) -> dict:
    """Banker's resource-request algorithm: grant only if the resulting state is safe."""
    _validate(available, maximum, allocation)
    if not 0 <= process < len(allocation):
        raise ValueError("process index out of range")
    if len(request) != len(available) or any(r < 0 for r in request):
        raise ValueError("request must be a non-negative vector with one entry per resource")
    need = need_matrix(maximum, allocation)
    if not _le(request, need[process]):
        return {"granted": False, "reason": "error: request exceeds the process's declared maximum need",
                "safety": None}
    if not _le(request, available):
        return {"granted": False, "reason": "must wait: not enough resources available right now",
                "safety": None}
    new_avail = [a - r for a, r in zip(available, request)]
    new_alloc = [row[:] for row in allocation]
    new_alloc[process] = _add(new_alloc[process], request)
    res = safety(new_avail, maximum, new_alloc)
    if res["safe"]:
        return {"granted": True, "reason": "granted: the state after allocation is safe", "safety": res,
                "available": new_avail, "allocation": new_alloc}
    return {"granted": False, "reason": "denied: granting would leave the system in an unsafe state",
            "safety": res}


def detect_deadlock(available: list[int], allocation: list[list[int]], request: list[list[int]]) -> dict:
    """Deadlock detection (multiple-instance resources) using the current Request matrix."""
    m = len(available)
    if len(allocation) != len(request) or any(len(r) != m for r in allocation + request):
        raise ValueError("allocation and request must be n x m matrices matching available")
    if any(x < 0 for row in allocation + request for x in row) or any(x < 0 for x in available):
        raise ValueError("values must be non-negative")
    n = len(allocation)
    work = list(available)
    # A process holding nothing cannot be part of a deadlock.
    finish = [all(x == 0 for x in allocation[i]) for i in range(n)]
    order = []
    progress = True
    while progress:
        progress = False
        for i in range(n):
            if not finish[i] and _le(request[i], work):
                work = _add(work, allocation[i])
                finish[i] = True
                order.append(i)
                progress = True
    dead = [i for i in range(n) if not finish[i]]
    return {"deadlocked": bool(dead), "processes": dead, "completion_order": order}
