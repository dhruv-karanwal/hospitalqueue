from app.engine.pcb import IORequest, PatientSpec
from app.engine.scenarios import LCG
from app.engine.simulator import SimConfig, simulate


def P(pid, arrival, burst, priority=3, io=(), doctor=None):
    return PatientSpec(id=pid, arrival=arrival, burst=burst, priority=priority,
                       io=tuple(IORequest(*r) for r in io), doctor=doctor)


def run(specs, **kw):
    kw.setdefault("check_invariants", True)
    return simulate(specs, SimConfig(**kw))


def waits(res):
    return {p["id"]: p["waiting"] for p in res["patients"]}


def runs(res, doctor=None):
    return [(s["patient"], s["start"], s["end"]) for s in res["gantt"]
            if s["kind"] == "run" and (doctor is None or s["doctor"] == doctor)]


def random_workload(seed, n=40, io=True):
    g = LCG(seed)
    out, t = [], 0
    for i in range(n):
        t += g.randint(0, 4)
        burst = g.randint(1, 12)
        reqs = []
        if io and burst > 3 and g.randint(0, 2) == 0:
            reqs.append((g.randint(1, burst - 1), ("lab", "xray", "pharmacy")[g.randint(0, 2)], g.randint(1, 6)))
        out.append(P(f"X{i}", t, burst, g.randint(1, 5), reqs))
    return out
