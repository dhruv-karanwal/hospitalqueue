import pytest

from app.engine.pcb import (BLOCKED, NEW, READY, RUNNING, TERMINATED, PCB, InvalidTransition,
                            PatientSpec, check_transition)
from app.engine.queues import ReadyQueue
from app.engine.trace import Trace, filter_events


@pytest.mark.parametrize("a,b", [(NEW, READY), (READY, RUNNING), (RUNNING, READY), (RUNNING, BLOCKED),
                                 (RUNNING, TERMINATED), (BLOCKED, READY)])
def test_legal_transitions(a, b):
    check_transition(a, b)


@pytest.mark.parametrize("a,b", [(NEW, RUNNING), (READY, BLOCKED), (BLOCKED, RUNNING), (TERMINATED, READY),
                                 (NEW, TERMINATED), (READY, TERMINATED)])
def test_illegal_transitions(a, b):
    with pytest.raises(InvalidTransition):
        check_transition(a, b)


def test_pcb_from_spec_and_transition():
    p = PCB.from_spec(PatientSpec("A", 0, 5, 1), 0)
    assert p.remaining == 5 and p.eff_priority == 1 and p.triage == "Resuscitation"
    p.transition(READY)
    with pytest.raises(InvalidTransition):
        p.transition(TERMINATED)


def test_ready_queue_order_and_lazy_update():
    q = ReadyQueue()
    q.push((3,), 0); q.push((1,), 1); q.push((2,), 2)
    q.push((0,), 0)                      # re-key idx 0
    assert len(q) == 3 and q.ordered() == [0, 1, 2]
    assert q.pop() == 0 and q.peek() == 1
    q.remove(1)
    assert q.pop() == 2 and len(q) == 0 and q.peek() is None


def test_fifo_with_constant_key():
    q = ReadyQueue()
    for i in (5, 3, 9):
        q.push((0,), i)
    assert [q.pop(), q.pop(), q.pop()] == [5, 3, 9]


def test_trace_filter():
    tr = Trace()
    tr.add(0, "ARRIVAL", "reception", "A arrives", "A")
    tr.add(1, "DISPATCH", "scheduler", "FCFS picks B", "B")
    assert [e["patient"] for e in filter_events(tr.events, patient="A")] == ["A"]
    assert len(filter_events(tr.events, types={"DISPATCH"})) == 1
    assert len(filter_events(tr.events, text="fcfs")) == 1
    off = Trace(enabled=False); off.add(0, "X", "y", "z")
    assert off.events == []
