"""API tests with FastAPI TestClient, including invalid input."""
import pytest

from app.engine.scenarios import BY_ID

TEXTBOOK = [{"id": "P1", "arrival_time": 0, "burst_time": 24},
            {"id": "P2", "arrival_time": 0, "burst_time": 3},
            {"id": "P3", "arrival_time": 0, "burst_time": 3}]


def test_policies(client):
    ids = [p["id"] for p in client.get("/api/policies").json()]
    assert ids == ["FCFS", "SJF", "SRTF", "PRIORITY_NP", "PRIORITY_P", "RR", "PRIORITY_AGING"]


def test_simulate_fcfs(client):
    r = client.post("/api/simulate", json={"patients": TEXTBOOK, "policy": "FCFS"})
    assert r.status_code == 200
    body = r.json()
    assert body["metrics"]["avg_waiting"] == 17.0
    assert {"gantt", "metrics", "trace", "patients", "doctors", "device_gantt"} <= body.keys()
    assert body["trace"][0]["type"] == "ARRIVAL"


def test_simulate_records_history(client):
    client.post("/api/simulate", json={"patients": TEXTBOOK, "policy": "SJF"})
    runs = client.get("/api/runs?limit=5").json()
    assert runs and runs[0]["policy"] == "SJF" and runs[0]["metrics"]["avg_waiting"] == 3.0


@pytest.mark.parametrize("bad", [
    {"patients": [{"id": "A", "arrival_time": -1, "burst_time": 3}]},
    {"patients": [{"id": "A", "arrival_time": 0, "burst_time": 0}]},
    {"patients": [{"id": "A", "arrival_time": 0, "burst_time": 3, "priority": 9}]},
    {"patients": [{"id": "bad id!", "arrival_time": 0, "burst_time": 3}]},
    {"patients": [{"id": "A", "arrival_time": 0, "burst_time": 3}] * 2},
    {"patients": TEXTBOOK, "policy": "LOTTERY"},
    {"patients": TEXTBOOK, "doctors": 0},
    {"patients": TEXTBOOK, "params": {"quantum": 0}},
    {"patients": TEXTBOOK, "unexpected": 1},
    {"patients": [{"id": "A", "arrival_time": 0, "burst_time": 3,
                   "io_requests": [{"at": 3, "device": "lab", "duration": 2}]}]},
    {"patients": [{"id": "A", "arrival_time": 0, "burst_time": 3,
                   "io_requests": [{"at": 1, "device": "mri", "duration": 2}]}]},
    {"patients": [{"id": "A", "arrival_time": 0, "burst_time": 3, "doctor_id": 3}], "doctors": 2},
    {"patients": "nope"},
])
def test_simulate_rejects_invalid(client, bad):
    assert client.post("/api/simulate", json=bad).status_code == 422


def test_compare(client):
    r = client.post("/api/compare", json={"patients": TEXTBOOK, "params": {"quantum": 4}})
    body = r.json()
    assert r.status_code == 200 and len(body["results"]) == 7
    assert "SJF" in body["best"]["avg_waiting"]


def test_compare_subset(client):
    r = client.post("/api/compare", json={"patients": TEXTBOOK, "policies": ["FCFS", "RR"]})
    assert [x["policy"] for x in r.json()["results"]] == ["FCFS", "RR"]


def test_scenarios_list_and_load(client):
    lst = client.get("/api/scenarios").json()
    ids = [s["id"] for s in lst if s["source"] == "builtin"]
    assert len(ids) == 6
    for sid in ids:
        sc = client.get(f"/api/scenarios/{sid}").json()
        r = client.post("/api/simulate", json={"patients": sc["patients"], "doctors": sc["doctors"],
                                               "policy": sc["policy"], "params": sc["params"], "save_run": False})
        assert r.status_code == 200, (sid, r.text)
        assert r.json()["metrics"]["completed"] == len(sc["patients"])
    assert len(BY_ID["opd-morning-rush"]["patients"]) == 30
    assert client.get("/api/scenarios/nope").status_code == 404


def test_save_and_delete_custom_scenario(client):
    body = {"id": "my-test", "title": "Mine", "patients": TEXTBOOK, "doctors": 1, "policy": "RR"}
    assert client.post("/api/scenarios", json=body).status_code == 201
    got = client.get("/api/scenarios/my-test").json()
    assert got["policy"] == "RR" and got["source"] == "saved" and len(got["patients"]) == 3
    assert any(s["id"] == "my-test" for s in client.get("/api/scenarios").json())
    assert client.delete("/api/scenarios/my-test").status_code == 200
    assert client.get("/api/scenarios/my-test").status_code == 404
    assert client.post("/api/scenarios", json={**body, "id": "convoy-effect"}).status_code == 409
    assert client.post("/api/scenarios", json={**body, "id": "Bad ID"}).status_code == 422
    assert client.delete("/api/scenarios/convoy-effect").status_code == 409


def test_aging_demo(client):
    sc = BY_ID["emergency-surge"]
    r = client.post("/api/aging-demo", json={"patients": sc["patients"], "params": sc["params"]}).json()
    assert r["summary"]["starved_with"] < r["summary"]["starved_without"]
    assert len(r["patients"]) == len(sc["patients"])


def test_multi_doctor(client):
    sc = BY_ID["govt-multi-counter"]
    r = client.post("/api/multi-doctor/compare", json={"patients": sc["patients"], "doctors": 3})
    body = r.json()
    assert body["global"]["metrics"]["avg_waiting"] < body["per_doctor"]["metrics"]["avg_waiting"]
    assert client.post("/api/multi-doctor/compare", json={"patients": [], "doctors": 1}).status_code == 422


def test_io_simulate(client):
    sc = BY_ID["lab-heavy-day"]
    r = client.post("/api/io/simulate", json={"patients": sc["patients"], "doctors": 2, "policy": "RR"}).json()
    assert r["metrics"]["interrupts"] > 5
    assert {e["type"] for e in r["events"]} == {"IO_REQUEST", "IO_START", "INTERRUPT"}


def test_safety_check(client):
    b = BY_ID["ambulance-dispatch"]["banker"]
    body = {k: b[k] for k in ("resources", "processes", "available", "max", "allocation")}
    r = client.post("/api/resources/safety-check", json=body).json()
    assert r["state"]["safe"] and r["state"]["sequence"] == [1, 3, 4, 0, 2]
    r = client.post("/api/resources/safety-check", json={**body, "request": {"process": 4, "vector": [3, 3, 0]}}).json()
    assert r["request"]["granted"] is False
    bad = {**body, "allocation": [[9, 9, 9]] + body["allocation"][1:]}
    assert client.post("/api/resources/safety-check", json=bad).status_code == 422
    assert client.post("/api/resources/safety-check", json={**body, "available": [1, 2]}).status_code == 422
    assert client.post("/api/resources/safety-check",
                       json={**body, "request": {"process": 9, "vector": [1, 0, 0]}}).status_code == 422


def test_deadlock_check(client):
    ex = BY_ID["ambulance-dispatch"]["banker"]["deadlock_example"]
    r = client.post("/api/resources/deadlock-check", json=ex).json()
    assert r["deadlocked"] and r["processes"] == [1, 2, 3, 4]
    assert client.post("/api/resources/deadlock-check",
                       json={"available": [1], "allocation": [[1]], "request": []}).status_code == 422


def test_race_demo(client):
    off = client.post("/api/sync/race-demo", json={"mode": "none"}).json()
    on = client.post("/api/sync/race-demo", json={"mode": "mutex"}).json()
    assert not off["correct"] and on["correct"]
    assert client.post("/api/sync/race-demo", json={"workers": 9}).status_code == 422


def test_producer_consumer(client):
    r = client.post("/api/producer-consumer", json={"capacity": 2, "count": 8, "interval": 0, "consumers": 1}).json()
    assert r["stats"]["producer_blocked_ticks"] > 0 and r["stats"]["consumed"] == 8
    assert client.post("/api/producer-consumer", json={"capacity": 0}).status_code == 422


def test_live_session_flow(client):
    r = client.post("/api/session", json={"patients": TEXTBOOK[:2], "doctors": 1, "policy": "PRIORITY_P"})
    assert r.status_code == 201
    sid = r.json()["id"]
    s = client.post(f"/api/session/{sid}/step", json={"ticks": 2}).json()
    assert s["clock"] == 2 and s["doctors"][0]["patient"] == "P1"
    s = client.post(f"/api/session/{sid}/patients",
                    json={"patients": [{"id": "EMG", "arrival_time": 2, "burst_time": 2, "priority": 1}]}).json()
    s = client.post(f"/api/session/{sid}/step", json={"ticks": 1}).json()
    assert s["doctors"][0]["patient"] == "EMG"                       # critical patient preempted P1
    st = client.get(f"/api/session/{sid}/state").json()
    assert st["clock"] == 3 and {p["id"]: p["state"] for p in st["process_table"]}["P1"] == "READY"
    tr = client.get(f"/api/session/{sid}/trace?patient=P1").json()
    assert tr["events"] and all(e["patient"] == "P1" for e in tr["events"])
    assert any(e["type"] == "PREEMPT" for e in tr["events"])
    s = client.post(f"/api/session/{sid}/step", json={"ticks": 100}).json()
    assert s["finished"] and s["metrics"]["completed"] == 3


def test_live_session_errors(client):
    sid = client.post("/api/session", json={"doctors": 1}).json()["id"]
    client.post(f"/api/session/{sid}/step", json={"ticks": 5})
    past = {"patients": [{"id": "OLD", "arrival_time": 1, "burst_time": 2}]}
    assert client.post(f"/api/session/{sid}/patients", json=past).status_code == 422
    assert client.post(f"/api/session/{sid}/step", json={"ticks": 0}).status_code == 422
    assert client.get("/api/session/doesnotexist/state").status_code == 404
