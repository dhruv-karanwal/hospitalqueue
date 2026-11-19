"""Textbook examples (Silberschatz, Operating System Concepts) with hand-calculated answers."""
import pytest

from app.engine.simulator import SimulationError
from helpers import P, run, runs, waits

FCFS_SET = [P("P1", 0, 24), P("P2", 0, 3), P("P3", 0, 3)]


def test_fcfs_textbook():
    r = run(FCFS_SET, policy="FCFS")
    assert waits(r) == {"P1": 0, "P2": 24, "P3": 27}
    assert r["metrics"]["avg_waiting"] == 17.0
    assert r["metrics"]["avg_turnaround"] == 27.0
    assert runs(r) == [("P1", 0, 24), ("P2", 24, 27), ("P3", 27, 30)]
    assert r["metrics"]["context_switches"] == 2


def test_fcfs_reordered_shows_convoy():
    r = run([P("P2", 0, 3), P("P3", 0, 3), P("P1", 0, 24)], policy="FCFS")
    assert r["metrics"]["avg_waiting"] == 3.0


def test_sjf_textbook():
    r = run([P("P1", 0, 6), P("P2", 0, 8), P("P3", 0, 7), P("P4", 0, 3)], policy="SJF")
    assert waits(r) == {"P1": 3, "P2": 16, "P3": 9, "P4": 0}
    assert r["metrics"]["avg_waiting"] == 7.0


def test_sjf_is_non_preemptive():
    r = run([P("A", 0, 8), P("B", 1, 1)], policy="SJF")
    assert runs(r) == [("A", 0, 8), ("B", 8, 9)]


def test_srtf_textbook():
    r = run([P("P1", 0, 8), P("P2", 1, 4), P("P3", 2, 9), P("P4", 3, 5)], policy="SRTF")
    assert runs(r) == [("P1", 0, 1), ("P2", 1, 5), ("P4", 5, 10), ("P1", 10, 17), ("P3", 17, 26)]
    assert waits(r) == {"P1": 9, "P2": 0, "P3": 15, "P4": 2}
    assert r["metrics"]["avg_waiting"] == 6.5
    assert r["metrics"]["preemptions"] == 1


def test_priority_np_textbook():
    r = run([P("P1", 0, 10, 3), P("P2", 0, 1, 1), P("P3", 0, 2, 4), P("P4", 0, 1, 5), P("P5", 0, 5, 2)],
            policy="PRIORITY_NP")
    assert [s[0] for s in runs(r)] == ["P2", "P5", "P1", "P3", "P4"]
    assert waits(r) == {"P1": 6, "P2": 0, "P3": 16, "P4": 18, "P5": 1}
    assert r["metrics"]["avg_waiting"] == 8.2


def test_priority_preemptive_critical_interrupts_routine():
    r = run([P("R", 0, 5, 5), P("C", 2, 2, 1)], policy="PRIORITY_P")
    assert runs(r) == [("R", 0, 2), ("C", 2, 4), ("R", 4, 7)]
    assert waits(r) == {"R": 2, "C": 0}
    assert r["metrics"]["preemptions"] == 1 and r["metrics"]["context_switches"] == 2
    seg = [s for s in r["gantt"] if s["patient"] == "R"][0]
    assert seg["end_reason"] == "preempted"
    assert any(e["type"] == "PREEMPT" and e["patient"] == "R" for e in r["trace"])


def test_priority_np_does_not_preempt():
    r = run([P("R", 0, 5, 5), P("C", 2, 2, 1)], policy="PRIORITY_NP")
    assert runs(r) == [("R", 0, 5), ("C", 5, 7)]


def test_round_robin_textbook_q4():
    r = run(FCFS_SET, policy="RR", quantum=4)
    assert runs(r) == [("P1", 0, 4), ("P2", 4, 7), ("P3", 7, 10), ("P1", 10, 30)]
    assert waits(r) == {"P1": 6, "P2": 4, "P3": 7}
    assert r["metrics"]["avg_waiting"] == pytest.approx(5.667)
    assert r["metrics"]["quantum_expiries"] == 1


def test_round_robin_q1_interleaves():
    r = run([P("A", 0, 2), P("B", 0, 2)], policy="RR", quantum=1)
    assert runs(r) == [("A", 0, 1), ("B", 1, 2), ("A", 2, 3), ("B", 3, 4)]


def test_round_robin_new_arrival_goes_before_preempted():
    r = run([P("A", 0, 4), P("B", 2, 1)], policy="RR", quantum=2)
    assert runs(r) == [("A", 0, 2), ("B", 2, 3), ("A", 3, 5)]


def test_response_time_and_idle_gap():
    r = run([P("A", 0, 2), P("B", 10, 3)], policy="FCFS")
    b = [p for p in r["patients"] if p["id"] == "B"][0]
    assert b["first_start"] == 10 and b["response"] == 0 and b["completion"] == 13
    assert r["metrics"]["utilization"] == pytest.approx(5 / 13, abs=1e-3)
    assert r["metrics"]["throughput"] == pytest.approx(2 / 13, abs=1e-3)


def test_tie_broken_by_input_order():
    r = run([P("B", 0, 3), P("A", 0, 3)], policy="SJF")
    assert runs(r)[0][0] == "B"


def test_context_switch_cost():
    r = run([P("R", 0, 5, 5), P("C", 2, 2, 1)], policy="PRIORITY_P", context_switch_cost=1)
    assert runs(r) == [("R", 0, 2), ("C", 3, 5), ("R", 6, 9)]
    sw = [(s["patient"], s["start"], s["end"]) for s in r["gantt"] if s["kind"] == "switch"]
    assert sw == [("C", 2, 3), ("R", 5, 6)]
    assert waits(r) == {"R": 4, "C": 1}
    assert r["metrics"]["switch_overhead"] == 2
    c = [p for p in r["patients"] if p["id"] == "C"][0]
    assert c["response"] == 1


def test_invalid_inputs():
    with pytest.raises(SimulationError):
        run([P("A", 0, 1), P("A", 1, 1)])
    with pytest.raises(SimulationError):
        run([P("A", 0, 1)], policy="LOTTERY")
    with pytest.raises(SimulationError):
        run([P("A", 0, 3, io=[(5, "lab", 1)])])
    with pytest.raises(SimulationError):
        run([P("A", 0, 3, io=[(1, "mri", 1)])])


def test_empty_workload():
    r = run([], policy="FCFS")
    assert r["metrics"]["completed"] == 0 and r["gantt"] == []
