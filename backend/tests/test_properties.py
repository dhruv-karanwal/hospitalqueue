"""Property checks over many generated workloads, all policies, both queue modes."""
import json
from collections import defaultdict

import pytest

from app.engine.simulator import POLICIES
from helpers import random_workload, run


def _check(res, specs):
    by = {s.id: s for s in specs}
    runs_by_patient = defaultdict(int)
    per_doc = defaultdict(list)
    intervals = defaultdict(list)
    for s in res["gantt"]:
        per_doc[s["doctor"]].append((s["start"], s["end"]))
        if s["kind"] == "run":
            runs_by_patient[s["patient"]] += s["end"] - s["start"]
            intervals[s["patient"]].append((s["start"], s["end"]))
    # total burst conserved per patient and overall
    assert dict(runs_by_patient) == {s.id: s.burst for s in specs}
    assert sum(d["busy"] for d in res["doctors"]) == sum(s.burst for s in specs)
    # a doctor never does two things at once
    for segs in per_doc.values():
        segs.sort()
        assert all(a[1] <= b[0] for a, b in zip(segs, segs[1:]))
    # a patient never runs on two doctors at once
    for iv in intervals.values():
        iv.sort()
        assert all(a[1] <= b[0] for a, b in zip(iv, iv[1:]))
    # metric formulas
    for p in res["patients"]:
        s = by[p["id"]]
        assert p["state"] == "TERMINATED"
        assert p["turnaround"] == p["completion"] - s.arrival
        assert p["waiting"] == p["turnaround"] - s.burst - p["blocked_time"]
        assert p["response"] == p["first_start"] - s.arrival >= 0
        assert p["waiting"] >= p["ready_wait"] >= 0
        assert p["first_start"] >= s.arrival
        assert p["completion"] >= s.arrival + s.burst + p["blocked_time"]


@pytest.mark.parametrize("policy", POLICIES)
@pytest.mark.parametrize("mode", ["global", "per_doctor"])
@pytest.mark.parametrize("seed", [1, 2, 3])
def test_properties(policy, mode, seed):
    specs = random_workload(seed)
    res = run(specs, policy=policy, doctors=3, queue_mode=mode, quantum=3, check_invariants=True)
    _check(res, specs)
    if True:   # waiting equals time in READY when there is no switch cost
        assert all(p["waiting"] == p["ready_wait"] for p in res["patients"])


@pytest.mark.parametrize("policy", POLICIES)
def test_properties_with_switch_cost(policy):
    specs = random_workload(9)
    res = run(specs, policy=policy, doctors=2, context_switch_cost=2)
    _check(res, specs)
    overhead = sum(s["end"] - s["start"] for s in res["gantt"] if s["kind"] == "switch")
    assert overhead == res["metrics"]["switch_overhead"] == 2 * res["metrics"]["context_switches"]


@pytest.mark.parametrize("policy", POLICIES)
def test_deterministic(policy):
    specs = random_workload(4)
    a = json.dumps(run(specs, policy=policy, doctors=2), sort_keys=True)
    b = json.dumps(run(specs, policy=policy, doctors=2), sort_keys=True)
    assert a == b


def test_trace_covers_every_transition():
    specs = random_workload(5, n=20)
    res = run(specs, policy="RR", doctors=2, quantum=2)
    for p in res["patients"]:
        ev = [e for e in res["trace"] if e["patient"] == p["id"] and e["to"]]
        assert ev[0]["type"] == "ARRIVAL" and ev[-1]["type"] == "COMPLETE"
        for a, b in zip(ev, ev[1:]):
            assert a["to"] == b["from"]           # trace is a consistent state history
