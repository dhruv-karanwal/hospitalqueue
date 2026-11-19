"""Higher-level experiments built from the pure simulator."""
from __future__ import annotations

from dataclasses import replace

from .metrics import best_per_metric
from .pcb import PatientSpec
from .simulator import POLICIES, POLICY_LABELS, SimConfig, simulate


def compare(specs: list[PatientSpec], cfg: SimConfig, policies: list[str] | None = None) -> dict:
    """Run the same workload under several policies."""
    results = []
    for pol in policies or list(POLICIES):
        r = simulate(specs, replace(cfg, policy=pol, include_trace=False))
        results.append({"policy": pol, "label": POLICY_LABELS[pol], "metrics": r["metrics"],
                        "waits": {p["id"]: p["waiting"] for p in r["patients"]}})
    return {"results": results, "best": best_per_metric(results)}


def aging_demo(specs: list[PatientSpec], cfg: SimConfig) -> dict:
    """Preemptive priority without aging vs with aging on the same workload."""
    base = simulate(specs, replace(cfg, policy="PRIORITY_P", include_trace=False))
    aged = simulate(specs, replace(cfg, policy="PRIORITY_AGING"))
    rows = []
    for a, b in zip(base["patients"], aged["patients"]):
        rows.append({"id": a["id"], "priority": a["priority"], "final_priority": b["final_priority"],
                     "wait_without": a["waiting"], "wait_with": b["waiting"],
                     "ready_wait_without": a["ready_wait"], "ready_wait_with": b["ready_wait"],
                     "starved_without": a["starved"], "starved_with": b["starved"]})
    rescued = [r["id"] for r in rows if r["starved_without"] and not r["starved_with"]]
    return {
        "threshold": cfg.starvation_threshold,
        "aging": {"interval": cfg.aging_interval, "step": cfg.aging_step},
        "without": {"metrics": base["metrics"], "gantt": base["gantt"]},
        "with": {"metrics": aged["metrics"], "gantt": aged["gantt"],
                 "aging_events": [e for e in aged["trace"] if e["type"] in ("AGING", "STARVATION")]},
        "patients": rows,
        "summary": {"starved_without": base["metrics"]["starvation_count"],
                    "starved_with": aged["metrics"]["starvation_count"],
                    "max_wait_without": base["metrics"]["max_wait"],
                    "max_wait_with": aged["metrics"]["max_wait"],
                    "rescued": rescued},
    }


def queue_mode_compare(specs: list[PatientSpec], cfg: SimConfig) -> dict:
    """Same doctors and policy: one common queue vs one queue per doctor."""
    out = {}
    for mode in ("global", "per_doctor"):
        r = simulate(specs, replace(cfg, queue_mode=mode, include_trace=False))
        busy = [d["busy"] for d in r["doctors"]]
        out[mode] = {"metrics": r["metrics"], "gantt": r["gantt"], "doctors": r["doctors"],
                     "load_imbalance": max(busy) - min(busy)}
    g, s = out["global"]["metrics"], out["per_doctor"]["metrics"]
    out["verdict"] = ("A single common queue gives lower average waiting" if g["avg_waiting"] < s["avg_waiting"]
                      else "Separate queues did as well or better on this workload"
                      ) + f" ({g['avg_waiting']} vs {s['avg_waiting']} min)."
    return out


def io_report(specs: list[PatientSpec], cfg: SimConfig) -> dict:
    r = simulate(specs, cfg)
    io_types = {"IO_REQUEST", "IO_START", "INTERRUPT"}
    return {"gantt": r["gantt"], "device_gantt": r["device_gantt"], "devices": r["devices"],
            "metrics": r["metrics"], "patients": r["patients"],
            "events": [e for e in r["trace"] if e["type"] in io_types]}
