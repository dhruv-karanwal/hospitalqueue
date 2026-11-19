import pytest

from app.engine.resources import detect_deadlock, request_resources, safety
from app.engine.scenarios import BANKER_AMBULANCE as B
from app.engine.sync import Mutex, Semaphore, producer_consumer, race_demo


def test_banker_textbook_safe():
    r = safety(B["available"], B["max"], B["allocation"])
    assert r["safe"] and r["sequence"] == [1, 3, 4, 0, 2]
    assert r["need"] == [[7, 4, 3], [1, 2, 2], [6, 0, 0], [0, 1, 1], [4, 3, 1]]
    assert r["steps"][-1]["work_after"] == [10, 5, 7]


def test_banker_unsafe_state():
    r = safety([0, 0, 0], [[2, 2, 2], [2, 2, 2]], [[1, 1, 1], [1, 1, 1]])
    assert not r["safe"] and r["sequence"] == [] and r["unfinished"] == [0, 1]


def test_banker_requests_textbook():
    g = request_resources(B["available"], B["max"], B["allocation"], 1, [1, 0, 2])
    assert g["granted"] and g["safety"]["sequence"] == [1, 3, 4, 0, 2]
    avail, alloc = g["available"], g["allocation"]
    assert avail == [2, 3, 0]
    w = request_resources(avail, B["max"], alloc, 4, [3, 3, 0])
    assert not w["granted"] and "wait" in w["reason"]
    u = request_resources(avail, B["max"], alloc, 0, [0, 2, 0])
    assert not u["granted"] and "unsafe" in u["reason"]


def test_banker_sample_requests_from_initial_state():
    for s in B["sample_requests"]:
        r = request_resources(B["available"], B["max"], B["allocation"], s["process"], s["request"])
        assert r["granted"] == s["expect"].startswith("granted")


def test_banker_edge_cases():
    assert safety([1], [], [])["safe"]                              # no processes
    assert safety([0, 0], [[0, 0]], [[0, 0]])["sequence"] == [0]    # zero need
    e = request_resources(B["available"], B["max"], B["allocation"], 1, [5, 0, 0])
    assert not e["granted"] and "exceeds" in e["reason"]
    with pytest.raises(ValueError):
        safety([1], [[1]], [[2]])                                   # allocation > max
    with pytest.raises(ValueError):
        safety([1, 1], [[1]], [[0]])                                # shape mismatch
    with pytest.raises(ValueError):
        request_resources([1], [[1]], [[0]], 3, [1])


def test_deadlock_detection():
    ok = detect_deadlock([0, 0, 0], [[0, 1, 0], [2, 0, 0], [3, 0, 3], [2, 1, 1], [0, 0, 2]],
                         [[0, 0, 0], [2, 0, 2], [0, 0, 0], [1, 0, 0], [0, 0, 2]])
    assert not ok["deadlocked"] and ok["completion_order"] == [0, 2, 3, 4, 1]
    ex = B["deadlock_example"]
    d = detect_deadlock(ex["available"], ex["allocation"], ex["request"])
    assert d["deadlocked"] and d["processes"] == [1, 2, 3, 4]


def test_race_without_lock_double_serves():
    r = race_demo(2, 4, "none")
    assert not r["correct"]
    assert r["duplicates"] and r["duplicates"][0] == {"token": 1, "workers": ["C1", "C2"]}


@pytest.mark.parametrize("mode", ["mutex", "semaphore"])
@pytest.mark.parametrize("workers", [2, 3])
def test_race_fixed_with_lock(mode, workers):
    r = race_demo(workers, 7, mode)
    assert r["correct"] and r["duplicates"] == [] and r["missed"] == []
    assert sorted(int(t) for t in r["served"]) == list(range(1, 8))
    assert all(len(v) == 1 for v in r["served"].values())


def test_issue_race():
    bad = race_demo(2, 6, "none", phase="issue")
    assert bad["duplicates"] and bad["final_counter"] < 7
    good = race_demo(2, 6, "mutex", phase="issue")
    assert good["correct"] and sorted(i["token"] for i in good["issued"]) == list(range(1, 7))
    assert good["final_counter"] == 7


def test_race_deterministic_and_validates():
    assert race_demo(3, 5, "none") == race_demo(3, 5, "none")
    with pytest.raises(ValueError):
        race_demo(2, 3, "spinlock")


def test_mutex_and_semaphore_primitives():
    m = Mutex()
    assert m.acquire(0) and not m.acquire(1)
    assert m.release(0) == 1 and m.owner == 1
    with pytest.raises(AssertionError):
        m.release(0)
    s = Semaphore(2)
    assert s.wait(0) and s.wait(1) and not s.wait(2)
    assert s.signal() == 2 and s.value == 0
    assert s.signal() is None and s.value == 1


def test_producer_consumer_blocks_and_conserves():
    r = producer_consumer(capacity=2, arrivals=[0] * 6, consumers=1, service_time=3)
    st = r["stats"]
    assert st["produced"] == st["consumed"] == 6
    assert st["producer_blocked_ticks"] > 0 and st["max_occupancy"] == 2
    assert r["invariant_ok"]
    for f in r["frames"]:
        assert f["empty"] + f["full"] == 2 and f["full"] == len(f["buffer"])


def test_producer_consumer_consumer_blocks_when_empty():
    r = producer_consumer(capacity=3, arrivals=[5], consumers=2, service_time=1)
    assert r["stats"]["consumer_blocked_ticks"] >= 10 and r["stats"]["consumed"] == 1


def test_producer_consumer_empty():
    r = producer_consumer(capacity=1, arrivals=[], consumers=1)
    assert r["stats"]["produced"] == 0 and len(r["frames"]) == 1
