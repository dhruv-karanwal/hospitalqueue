"""Efficiency requirement: 500 patients under any policy in < 200 ms (trace on)."""
import time

import pytest

from app.engine.simulator import POLICIES
from helpers import random_workload, run

WORKLOAD = random_workload(42, n=500)


@pytest.mark.parametrize("policy", POLICIES)
def test_500_patients_under_200ms(policy):
    best = float("inf")
    for _ in range(3):
        t0 = time.perf_counter()
        res = run(WORKLOAD, policy=policy, doctors=3, quantum=2, check_invariants=False)
        best = min(best, time.perf_counter() - t0)
    assert res["metrics"]["completed"] == 500
    print(f"{policy}: {best * 1000:.1f} ms")
    assert best < 0.2, f"{policy} took {best * 1000:.1f} ms"


HEAVY = [type(p)(id=p.id, arrival=i // 10, burst=p.burst, priority=p.priority, io=p.io)
         for i, p in enumerate(WORKLOAD)]


@pytest.mark.parametrize("policy", POLICIES)
def test_500_patients_heavy_queue_under_200ms(policy):
    """Worst case: all 500 arrive within 50 min on 2 doctors, so the ready queue holds hundreds."""
    best = float("inf")
    for _ in range(3):
        t0 = time.perf_counter()
        res = run(HEAVY, policy=policy, doctors=2, quantum=2, context_switch_cost=1, check_invariants=False)
        best = min(best, time.perf_counter() - t0)
    assert res["metrics"]["completed"] == 500
    print(f"heavy {policy}: {best * 1000:.1f} ms, trace events {len(res['trace'])}")
    assert best < 0.2, f"{policy} took {best * 1000:.1f} ms"


def test_api_500_patients_end_to_end(client):
    body = {"patients": [{"id": p.id, "arrival_time": p.arrival, "burst_time": p.burst, "priority": p.priority,
                          "io_requests": [{"at": r.at, "device": r.device, "duration": r.duration} for r in p.io]}
                         for p in WORKLOAD], "doctors": 3, "policy": "PRIORITY_AGING", "save_run": False}
    t0 = time.perf_counter()
    r = client.post("/api/simulate", json=body)
    dt = time.perf_counter() - t0
    assert r.status_code == 200 and r.json()["metrics"]["completed"] == 500
    print(f"API round trip incl. validation + JSON: {dt * 1000:.1f} ms")
    assert dt < 1.0
