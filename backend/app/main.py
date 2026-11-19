"""FastAPI routes. Routes validate input (Pydantic) and call the pure engine; no logic lives here."""
from __future__ import annotations

import secrets
import threading
from collections import OrderedDict
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import __version__, db
from .engine import analysis, resources, sync
from .engine.scenarios import BY_ID, SCENARIOS
from .engine.simulator import POLICIES, POLICY_LABELS, Simulation, SimulationError, simulate
from .engine.trace import filter_events
from .models import (BankerRequest, CompareRequest, DeadlockRequest, Health, MultiDoctorRequest,
                     ProducerConsumerRequest, RaceRequest, ScenarioSave, SessionCreate, SessionPatients,
                     SessionStep, SimulateRequest, Workload)

API_HOST = "127.0.0.1"  # loopback only, never 0.0.0.0
API_PORT = 8000
MAX_SESSIONS = 32


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init_db()
    yield


app = FastAPI(title="MediQueue OS", version=__version__, lifespan=lifespan,
              description="Hospital queue scheduling simulator (OS course project). Not a clinical system.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)


def _engine(fn, *args, **kw):
    try:
        return fn(*args, **kw)
    except (SimulationError, ValueError) as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


@app.get("/api/health", response_model=Health)
def health() -> Health:
    return Health(status="ok", app="MediQueue OS", version=__version__)


@app.get("/api/policies")
def policies():
    return [{"id": p, "label": POLICY_LABELS[p]} for p in POLICIES]


# ---------------------------------------------------------------- simulation
@app.post("/api/simulate")
def simulate_route(req: SimulateRequest):
    res = _engine(simulate, req.specs(), req.config(req.policy))
    if req.save_run:
        db.record_run(req.policy, len(req.patients), req.doctors, res["metrics"])
    return res


@app.post("/api/compare")
def compare_route(req: CompareRequest):
    return _engine(analysis.compare, req.specs(), req.config(), list(dict.fromkeys(req.policies)))


@app.post("/api/aging-demo")
def aging_route(req: Workload):
    return _engine(analysis.aging_demo, req.specs(), req.config())


@app.post("/api/multi-doctor/compare")
def multi_doctor_route(req: MultiDoctorRequest):
    return _engine(analysis.queue_mode_compare, req.specs(), req.config(req.policy))


@app.post("/api/io/simulate")
def io_route(req: SimulateRequest):
    return _engine(analysis.io_report, req.specs(), req.config(req.policy))


# ----------------------------------------------------------------- resources
@app.post("/api/resources/safety-check")
def safety_route(req: BankerRequest):
    out = {"resources": req.resources,
           "processes": req.processes or [f"P{i}" for i in range(len(req.max))],
           "state": _engine(resources.safety, req.available, req.max, req.allocation)}
    if req.request is not None:
        out["request"] = _engine(resources.request_resources, req.available, req.max, req.allocation,
                                 req.request.process, req.request.vector)
    return out


@app.post("/api/resources/deadlock-check")
def deadlock_route(req: DeadlockRequest):
    return _engine(resources.detect_deadlock, req.available, req.allocation, req.request)


# ---------------------------------------------------------------------- sync
@app.post("/api/sync/race-demo")
def race_route(req: RaceRequest):
    return sync.race_demo(req.workers, req.tokens, req.mode, req.phase)


@app.post("/api/producer-consumer")
def pc_route(req: ProducerConsumerRequest):
    return sync.producer_consumer(req.capacity, req.arrival_times(), req.consumers, req.service_time, req.horizon)


# ----------------------------------------------------------------- scenarios
@app.get("/api/scenarios")
def scenarios_route():
    built = [{"id": s["id"], "title": s["title"], "description": s["description"], "concept": s["concept"],
              "patients": len(s["patients"]), "source": "builtin"} for s in SCENARIOS]
    saved = [{**s, "source": "saved", "concept": "Custom"} for s in db.list_scenarios()]
    return built + saved


@app.get("/api/scenarios/{sid}")
def scenario_route(sid: str):
    if sid in BY_ID:
        return {**BY_ID[sid], "source": "builtin"}
    s = db.get_scenario(sid)
    if s is None:
        raise HTTPException(404, f"scenario {sid!r} not found")
    return {**s, "source": "saved"}


@app.post("/api/scenarios", status_code=201)
def save_scenario_route(req: ScenarioSave):
    if req.id in BY_ID:
        raise HTTPException(409, "cannot overwrite a built-in scenario")
    payload = req.model_dump()
    payload["patients"] = [p.model_dump() for p in req.patients]
    db.save_scenario(req.id, req.title, req.description, payload)
    return {"id": req.id, "saved": True}


@app.delete("/api/scenarios/{sid}")
def delete_scenario_route(sid: str):
    if sid in BY_ID:
        raise HTTPException(409, "cannot delete a built-in scenario")
    if not db.delete_scenario(sid):
        raise HTTPException(404, f"scenario {sid!r} not found")
    return {"deleted": sid}


@app.get("/api/runs")
def runs_route(limit: int = Query(20, ge=1, le=200)):
    return db.list_runs(limit)


# -------------------------------------------------------------- live session
_sessions: OrderedDict[str, tuple[threading.Lock, Simulation]] = OrderedDict()
_sessions_lock = threading.Lock()


def _get_session(sid: str) -> tuple[threading.Lock, Simulation]:
    with _sessions_lock:
        s = _sessions.get(sid)
    if s is None:
        raise HTTPException(404, "session not found (sessions live in memory and reset on restart)")
    return s


@app.post("/api/session", status_code=201)
def session_create(req: SessionCreate):
    w = Workload(patients=req.patients, doctors=req.doctors, params=req.params)
    sim = _engine(Simulation, w.specs(), w.config(req.policy))
    sid = secrets.token_hex(8)
    with _sessions_lock:
        _sessions[sid] = (threading.Lock(), sim)
        while len(_sessions) > MAX_SESSIONS:
            _sessions.popitem(last=False)
    return {"id": sid, "state": sim.snapshot()}


@app.post("/api/session/{sid}/patients")
def session_add(sid: str, req: SessionPatients):
    lock, sim = _get_session(sid)
    with lock:
        if len(sim.P) + len(req.patients) > 300:
            raise HTTPException(422, "a live session holds at most 300 patients")
        for p in req.patients:
            if p.doctor_id is not None and p.doctor_id > sim.cfg.doctors:
                raise HTTPException(422, f"{p.id}: doctor_id exceeds number of doctors")
            _engine(sim.add_patient, p.to_spec())
        return sim.snapshot()


@app.post("/api/session/{sid}/step")
def session_step(sid: str, req: SessionStep):
    lock, sim = _get_session(sid)
    with lock:
        sim.advance(req.ticks)
        return sim.snapshot()


@app.get("/api/session/{sid}/state")
def session_state(sid: str):
    lock, sim = _get_session(sid)
    with lock:
        return sim.snapshot()


@app.get("/api/session/{sid}/trace")
def session_trace(sid: str, patient: str | None = Query(None, max_length=20),
                  type: str | None = Query(None, max_length=20), limit: int = Query(500, ge=1, le=5000)):
    lock, sim = _get_session(sid)
    with lock:
        ev = filter_events(sim.trace.events, patient=patient, types={type} if type else None)
        return {"clock": sim.t, "total": len(ev), "events": ev[-limit:]}


def run() -> None:
    import uvicorn

    uvicorn.run("app.main:app", host=API_HOST, port=API_PORT, reload=False)


if __name__ == "__main__":
    run()
