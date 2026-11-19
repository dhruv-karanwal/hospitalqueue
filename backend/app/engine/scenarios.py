"""Six preset workloads. Generated with a fixed-seed LCG so they never change."""
from __future__ import annotations


class LCG:
    """Tiny deterministic generator (same numbers on every Python version)."""

    def __init__(self, seed: int) -> None:
        self.s = seed

    def next(self) -> int:
        self.s = (1103515245 * self.s + 12345) % 2**31
        return self.s >> 8

    def randint(self, a: int, b: int) -> int:
        return a + self.next() % (b - a + 1)


def _p(pid, arrival, burst, priority, name=None, io=None, doctor=None):
    d = {"id": pid, "name": name or pid, "arrival_time": arrival, "burst_time": burst, "priority": priority,
         "io_requests": io or []}
    if doctor is not None:
        d["doctor_id"] = doctor
    return d


def _opd_rush():
    g = LCG(2024)
    t, out = 0, []
    for i in range(30):
        t += g.randint(0, 3)
        pr = (3, 4, 4, 5, 5, 3, 2, 4, 5, 3)[g.randint(0, 9)]
        out.append(_p(f"P{i + 1:02d}", t, g.randint(2, 14), pr))
    return out


def _emergency_surge():
    out = [_p(f"R{i + 1}", i, 6, 5, f"Routine {i + 1}") for i in range(4)]
    for k in range(14):
        out.append(_p(f"E{k + 1:02d}", 1 + 3 * k, 3, 1 if k % 2 == 0 else 2, f"Emergency {k + 1}"))
    return out


def _convoy():
    out = [_p("P1", 0, 24, 3, "Long consultation")]
    out += [_p(f"P{i}", i - 1, 3 if i % 2 else 2, 3) for i in range(2, 8)]
    return out


def _govt():
    g = LCG(77)
    out = []
    for i in range(18):
        burst = 18 if i in (0, 4, 8) else g.randint(2, 5)
        out.append(_p(f"C{i + 1:02d}", i, burst, 4, f"Citizen {i + 1}"))
    return out


def _ambulance_workload():
    return [_p("A1", 0, 5, 1, "Cardiac arrest"), _p("A2", 1, 4, 2, "Road accident"),
            _p("A3", 2, 6, 3, "Fracture"), _p("A4", 2, 3, 2, "Burns"),
            _p("A5", 4, 4, 4, "Fever"), _p("A6", 5, 2, 1, "Stroke"),
            _p("A7", 6, 5, 3, "Asthma"), _p("A8", 8, 3, 5, "Check-up")]


def _lab_heavy():
    g = LCG(5)
    devs = ("lab", "xray", "lab", "pharmacy")
    out = []
    for i in range(12):
        burst = g.randint(5, 10)
        io = []
        if i % 4 != 3:
            io.append({"at": g.randint(1, 2), "device": devs[i % 4], "duration": g.randint(3, 6)})
            if i % 3 == 0 and burst > 4:
                io.append({"at": burst - 2, "device": "xray" if devs[i % 4] != "xray" else "lab",
                           "duration": g.randint(2, 4)})
        out.append(_p(f"L{i + 1:02d}", i * 2, burst, g.randint(2, 5), io=io))
    return out


BANKER_AMBULANCE = {
    "resources": ["beds", "ambulances", "lab_devices"],
    "processes": ["Trauma ward", "Cardiac unit", "Maternity", "Pediatrics", "General ward"],
    "available": [3, 3, 2],
    "max": [[7, 5, 3], [3, 2, 2], [9, 0, 2], [2, 2, 2], [4, 3, 3]],
    "allocation": [[0, 1, 0], [2, 0, 0], [3, 0, 2], [2, 1, 1], [0, 0, 2]],
    "sample_requests": [
        {"process": 1, "request": [1, 0, 2], "expect": "granted (safe)"},
        {"process": 4, "request": [3, 3, 0], "expect": "denied (unsafe)"},
        {"process": 0, "request": [0, 2, 0], "expect": "granted (safe)"},
    ],
    "deadlock_example": {
        "available": [0, 0, 0],
        "allocation": [[0, 1, 0], [2, 0, 0], [3, 0, 3], [2, 1, 1], [0, 0, 2]],
        "request": [[0, 0, 0], [2, 0, 2], [0, 0, 1], [1, 0, 0], [0, 0, 2]],
    },
}


def _build():
    base_params = {"quantum": 3, "context_switch_cost": 0, "aging_interval": 4, "aging_step": 1,
                   "starvation_threshold": 25, "queue_mode": "global"}
    return [
        {"id": "opd-morning-rush", "title": "OPD morning rush", "concept": "CPU scheduling",
         "description": "30 outpatients with mixed consultation lengths arrive over the first hour; 3 doctors.",
         "explanation": "Compare all policies: SJF/SRTF minimise average wait, RR gives the best response time, FCFS is simplest but slowest on average.",
         "doctors": 3, "policy": "FCFS", "params": dict(base_params), "patients": _opd_rush()},
        {"id": "emergency-surge", "title": "Emergency surge", "concept": "Starvation and aging",
         "description": "4 routine patients (P5) wait while a steady stream of critical patients (P1/P2) arrives every 3 minutes; 1 doctor.",
         "explanation": "Under preemptive priority the routine patients starve until the surge ends. With aging their priority rises every 4 minutes of waiting, so they are served earlier.",
         "doctors": 1, "policy": "PRIORITY_P", "params": dict(base_params), "patients": _emergency_surge()},
        {"id": "convoy-effect", "title": "Convoy effect", "concept": "Convoy effect",
         "description": "One 24-minute consultation arrives first, followed by six 2-3 minute patients; 1 doctor.",
         "explanation": "With FCFS every short patient queues behind the long one (a convoy), so average waiting is high. SJF cannot help: the long consultation has already started and SJF never preempts. SRTF and Round Robin break the convoy.",
         "doctors": 1, "policy": "FCFS", "params": dict(base_params), "patients": _convoy()},
        {"id": "govt-multi-counter", "title": "Multi-counter government service", "concept": "Multi-doctor scheduling",
         "description": "18 citizens at 3 counters. Three requests take 18 minutes. Citizens join the shortest line by head count.",
         "explanation": "Separate queues trap people behind long requests while other counters go idle. One common queue (any free counter takes the next citizen) balances load.",
         "doctors": 3, "policy": "FCFS", "params": {**base_params, "queue_mode": "per_doctor"}, "patients": _govt()},
        {"id": "ambulance-dispatch", "title": "Ambulance dispatch", "concept": "Deadlock avoidance (Banker's)",
         "description": "5 units compete for beds, ambulances and lab devices; plus 8 emergency calls handled by 2 crews.",
         "explanation": "Banker's algorithm grants a request only if a safe sequence still exists. The initial state is safe: Cardiac unit, Pediatrics, General ward, Trauma ward, Maternity.",
         "doctors": 2, "policy": "PRIORITY_P", "params": dict(base_params), "patients": _ambulance_workload(),
         "banker": BANKER_AMBULANCE},
        {"id": "lab-heavy-day", "title": "Lab-heavy day", "concept": "I/O and interrupts",
         "description": "12 patients, most need a lab test, X-ray or pharmacy visit mid-consultation; 1 unit of each device, 2 doctors.",
         "explanation": "Patients become BLOCKED while at a device; doctors take other patients meanwhile. A completion interrupt returns each patient to READY.",
         "doctors": 2, "policy": "RR", "params": dict(base_params), "patients": _lab_heavy()},
    ]


SCENARIOS = _build()
BY_ID = {s["id"]: s for s in SCENARIOS}
