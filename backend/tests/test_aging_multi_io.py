from app.engine.analysis import aging_demo, compare, queue_mode_compare
from app.engine.pcb import PatientSpec, IORequest
from app.engine.scenarios import BY_ID
from app.engine.simulator import SimConfig
from helpers import P, run, runs, waits

STREAM = [P("LOW", 0, 2, 5)] + [P(f"C{i}", 2 * i, 2, 1) for i in range(5)]


def test_starvation_without_aging():
    r = run(STREAM, policy="PRIORITY_P", starvation_threshold=5)
    assert waits(r)["LOW"] == 10
    assert r["metrics"]["starvation_count"] == 1
    assert any(e["type"] == "STARVATION" and e["patient"] == "LOW" for e in r["trace"])


def test_aging_hand_calculated():
    r = run(STREAM, policy="PRIORITY_AGING", aging_interval=2, aging_step=2, starvation_threshold=5)
    assert waits(r)["LOW"] == 4
    assert ("LOW", 4, 6) in runs(r)
    aging = [(e["t"], e["reason"]) for e in r["trace"] if e["type"] == "AGING"]
    assert [t for t, _ in aging] == [2, 4]
    assert "P5 -> P3" in aging[0][1] and "P3 -> P1" in aging[1][1]
    assert r["metrics"]["starvation_count"] == 0


def test_aging_demo_on_emergency_surge():
    sc = BY_ID["emergency-surge"]
    specs = [PatientSpec(p["id"], p["arrival_time"], p["burst_time"], p["priority"]) for p in sc["patients"]]
    d = aging_demo(specs, SimConfig(doctors=1, aging_interval=4, aging_step=1, starvation_threshold=25))
    s = d["summary"]
    assert s["starved_without"] > s["starved_with"]
    assert s["max_wait_with"] < s["max_wait_without"]
    assert s["rescued"]


def test_two_doctors_global_queue():
    r = run([P(f"P{i}", 0, 4) for i in range(1, 5)], policy="FCFS", doctors=2)
    assert waits(r) == {"P1": 0, "P2": 0, "P3": 4, "P4": 4}
    assert runs(r, "D1") == [("P1", 0, 4), ("P3", 4, 8)]
    assert runs(r, "D2") == [("P2", 0, 4), ("P4", 4, 8)]


def test_per_doctor_queue_imbalance():
    w = [P("P1", 0, 10), P("P2", 0, 1), P("P3", 0, 1)]
    g = run(w, policy="FCFS", doctors=2, queue_mode="global")
    s = run(w, policy="FCFS", doctors=2, queue_mode="per_doctor")
    assert waits(g)["P3"] == 1
    assert waits(s)["P3"] == 10           # joined D1's line, stuck behind the long consult


def test_per_doctor_preferred_doctor():
    r = run([P("A", 0, 3, doctor=2), P("B", 0, 3, doctor=2)], doctors=2, queue_mode="per_doctor")
    assert runs(r, "D1") == [] and runs(r, "D2") == [("A", 0, 3), ("B", 3, 6)]


def test_global_preemption_targets_worst_running():
    r = run([P("A", 0, 6, 2), P("B", 0, 6, 4), P("C", 1, 2, 1)], policy="PRIORITY_P", doctors=2)
    assert runs(r, "D2")[:2] == [("B", 0, 1), ("C", 1, 3)]
    assert runs(r, "D1") == [("A", 0, 6)]


def test_queue_mode_compare_govt():
    sc = BY_ID["govt-multi-counter"]
    specs = [PatientSpec(p["id"], p["arrival_time"], p["burst_time"], p["priority"]) for p in sc["patients"]]
    out = queue_mode_compare(specs, SimConfig(doctors=3))
    assert out["global"]["metrics"]["avg_waiting"] < out["per_doctor"]["metrics"]["avg_waiting"]


def test_io_block_and_interrupt():
    r = run([P("P1", 0, 4, io=[(2, "lab", 3)]), P("P2", 0, 3)], policy="FCFS")
    assert runs(r) == [("P1", 0, 2), ("P2", 2, 5), ("P1", 5, 7)]
    p1 = [p for p in r["patients"] if p["id"] == "P1"][0]
    assert p1["blocked_time"] == 3 and p1["waiting"] == 0 and p1["turnaround"] == 7
    assert waits(r)["P2"] == 2
    assert r["metrics"]["interrupts"] == 1
    types = [e["type"] for e in r["trace"] if e["patient"] == "P1"]
    assert types == ["ARRIVAL", "DISPATCH", "IO_REQUEST", "IO_START", "INTERRUPT", "CONTEXT_SWITCH", "DISPATCH", "COMPLETE"]
    assert r["device_gantt"] == [{"device": "lab", "unit": 1, "patient": "P1", "start": 2, "end": 5, "requested": 2}]


def test_device_queue_contention():
    r = run([P("A", 0, 2, io=[(1, "lab", 4)]), P("B", 0, 2, io=[(1, "lab", 4)])], policy="FCFS")
    dg = [(d["patient"], d["start"], d["end"]) for d in r["device_gantt"]]
    assert dg == [("A", 1, 5), ("B", 5, 9)]       # B waits in the device queue from t=2
    b = [p for p in r["patients"] if p["id"] == "B"][0]
    assert b["blocked_time"] == 7 and b["completion"] == 10
    assert r["devices"][0]["max_queue"] == 1


def test_two_lab_units_parallel():
    r = run([P("A", 0, 2, io=[(1, "lab", 4)]), P("B", 0, 2, io=[(1, "lab", 4)])], policy="FCFS",
            devices=(("lab", 2),))
    assert [(d["unit"], d["start"]) for d in r["device_gantt"]] == [(1, 1), (2, 2)]


def test_compare_best_policy():
    out = compare([P("P1", 0, 24), P("P2", 0, 3), P("P3", 0, 3)], SimConfig(quantum=4))
    by = {r["policy"]: r["metrics"] for r in out["results"]}
    assert by["FCFS"]["avg_waiting"] == 17.0 and by["SJF"]["avg_waiting"] == 3.0
    assert "SJF" in out["best"]["avg_waiting"] and "SRTF" in out["best"]["avg_waiting"]
    assert len(out["results"]) == 7
