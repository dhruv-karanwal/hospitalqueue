"""Synchronization labs: race condition vs mutex/semaphore, and bounded-buffer producer-consumer.

Concurrency is simulated deterministically: workers are interleaved one
instruction at a time in round-robin order (the worst case for races), so the
same input always shows the same interleaving.
"""
from __future__ import annotations

from collections import deque

MODES = ("none", "mutex", "semaphore")


class Mutex:
    """Simulated mutex with an owner and a FIFO wait queue."""

    def __init__(self) -> None:
        self.owner: int | None = None
        self.waiters: deque[int] = deque()

    def acquire(self, w: int) -> bool:
        if self.owner is None:
            self.owner = w
            return True
        if w not in self.waiters:
            self.waiters.append(w)
        return False

    def release(self, w: int) -> int | None:
        assert self.owner == w, "only the owner may unlock a mutex"
        self.owner = self.waiters.popleft() if self.waiters else None
        return self.owner

    def describe(self) -> str:
        return "free" if self.owner is None else f"held by C{self.owner + 1}"


class Semaphore:
    """Counting semaphore: wait() / signal() with a FIFO queue of blocked workers."""

    def __init__(self, value: int) -> None:
        self.value = value
        self.waiters: deque[int] = deque()

    def wait(self, w: int) -> bool:
        if self.value > 0:
            self.value -= 1
            return True
        if w not in self.waiters:
            self.waiters.append(w)
        return False

    def signal(self) -> int | None:
        if self.waiters:
            return self.waiters.popleft()   # hand the permit directly to a waiter
        self.value += 1
        return None

    # uniform interface used by the race demo
    def acquire(self, w: int) -> bool:
        return self.wait(w)

    def release(self, w: int) -> int | None:
        return self.signal()

    def describe(self) -> str:
        return f"S={self.value}"


def race_demo(workers: int = 2, tokens: int = 6, mode: str = "none", phase: str = "pickup") -> dict:
    """phase="pickup": counters take the next token from a shared 'now serving' counter.
    phase="issue": kiosks hand out token numbers from a shared 'next token' counter."""
    if mode not in MODES:
        raise ValueError(f"mode must be one of {MODES}")
    if phase not in ("pickup", "issue"):
        raise ValueError("phase must be 'pickup' or 'issue'")
    lock = None if mode == "none" else (Mutex() if mode == "mutex" else Semaphore(1))
    shared = 1
    body = ["READ", "CHECK", "SERVE", "WRITE"] if phase == "pickup" else ["READ", "ASSIGN", "WRITE"]
    prog = (["ACQUIRE"] + body + ["RELEASE"]) if lock else body
    pc = [0] * workers
    local = [0] * workers
    done = [False] * workers
    blocked = [False] * workers
    # issue phase: patients assigned to kiosks round-robin
    pending = [deque(f"PT{j + 1}" for j in range(tokens) if j % workers == w) for w in range(workers)]
    current = [None] * workers
    served: dict[int, list[int]] = {}
    issued: list[dict] = []
    steps: list[dict] = []
    name = (lambda w: f"C{w + 1}") if phase == "pickup" else (lambda w: f"K{w + 1}")

    def log(w, op, note):
        steps.append({"step": len(steps) + 1, "worker": name(w), "op": op, "local": local[w],
                      "shared": shared, "lock": lock.describe() if lock else "no lock", "note": note})

    guard = 0
    while not all(done) and guard < 20000:
        guard += 1
        progressed = False
        for w in range(workers):
            if done[w] or blocked[w]:
                continue
            if phase == "issue" and pc[w] == 0 and current[w] is None:
                if not pending[w]:
                    done[w] = True
                    continue
                current[w] = pending[w].popleft()
            op = prog[pc[w]]
            progressed = True
            if op == "ACQUIRE":
                if lock.acquire(w):
                    log(w, op, "enters the critical section")
                else:
                    blocked[w] = True
                    log(w, op, "lock busy: blocked")
                    continue
            elif op == "READ":
                local[w] = shared
                log(w, op, f"reads shared counter = {shared}")
            elif op == "CHECK":
                if local[w] > tokens:
                    log(w, op, "no tokens left")
                    if lock:
                        _wake(lock.release(w), blocked, pc)
                        log(w, "RELEASE", "leaves the critical section")
                    done[w] = True
                    continue
                log(w, op, f"token {local[w]} is waiting")
            elif op == "SERVE":
                served.setdefault(local[w], []).append(w)
                dup = len(served[local[w]]) > 1
                log(w, op, f"serves token {local[w]}" + ("  <-- DUPLICATE SERVICE" if dup else ""))
            elif op == "ASSIGN":
                issued.append({"patient": current[w], "token": local[w], "kiosk": name(w)})
                log(w, op, f"gives token {local[w]} to {current[w]}")
            elif op == "WRITE":
                shared = local[w] + 1
                log(w, op, f"writes shared counter = {shared}")
            elif op == "RELEASE":
                _wake(lock.release(w), blocked, pc)
                log(w, op, "leaves the critical section")
            pc[w] = (pc[w] + 1) % len(prog)
            if phase == "issue" and pc[w] == 0:
                current[w] = None
        if not progressed:
            break

    if phase == "pickup":
        dups = [{"token": t, "workers": [name(w) for w in ws]} for t, ws in sorted(served.items()) if len(ws) > 1]
        missed = [t for t in range(1, tokens + 1) if t not in served]
        result = {"served": {str(t): [name(w) for w in ws] for t, ws in sorted(served.items())}}
    else:
        seen: dict[int, list[str]] = {}
        for it in issued:
            seen.setdefault(it["token"], []).append(it["patient"])
        dups = [{"token": t, "workers": ps} for t, ps in sorted(seen.items()) if len(ps) > 1]
        missed = []
        result = {"issued": issued, "final_counter": shared}
    return {"mode": mode, "phase": phase, "workers": workers, "tokens": tokens, "steps": steps,
            "duplicates": dups, "missed": missed, "correct": not dups and not missed, **result}


def _wake(w: int | None, blocked: list[bool], pc: list[int]) -> None:
    if w is not None:          # lock handed to a waiter: it now owns the lock, skip its ACQUIRE
        blocked[w] = False
        pc[w] = 1


def producer_consumer(capacity: int = 3, arrivals: list[int] | None = None, consumers: int = 2,
                      service_time: int = 3, horizon: int = 500) -> dict:
    """Reception (producer) puts arriving patients into a bounded waiting area (buffer);
    counters (consumers) take them out. Uses semaphores empty / full and a mutex."""
    arrivals = sorted(arrivals or [])
    empty, full = Semaphore(capacity), Semaphore(0)
    buffer: deque[str] = deque()
    backlog: deque[tuple[str, int]] = deque()
    busy_until = [0] * consumers
    serving: list[str | None] = [None] * consumers
    ai = 0
    frames = []
    stats = {"produced": 0, "consumed": 0, "producer_blocked_ticks": 0, "consumer_blocked_ticks": 0,
             "max_occupancy": 0, "total_door_wait": 0}
    total = len(arrivals)
    t = 0
    while t <= horizon:
        for c in range(consumers):
            if serving[c] is not None and busy_until[c] <= t:
                serving[c] = None
        while ai < total and arrivals[ai] <= t:
            backlog.append((f"T{ai + 1}", arrivals[ai]))
            ai += 1
        prod_state = "idle"
        if backlog:
            if empty.wait(0):                     # wait(empty)
                tok, at = backlog.popleft()
                buffer.append(tok)                # mutex held implicitly: single step is atomic
                stats["produced"] += 1
                stats["total_door_wait"] += t - at
                full.signal()                     # signal(full)
                prod_state = f"put {tok}"
            else:
                empty.waiters.clear()
                prod_state = "blocked (buffer full)"
                stats["producer_blocked_ticks"] += 1
        cons = []
        for c in range(consumers):
            if serving[c] is None:
                if full.wait(c):
                    tok = buffer.popleft()
                    empty.signal()
                    serving[c] = tok
                    busy_until[c] = t + service_time
                    stats["consumed"] += 1
                    cons.append({"id": f"C{c + 1}", "state": "took", "patient": tok})
                else:
                    full.waiters.clear()
                    stats["consumer_blocked_ticks"] += 1
                    cons.append({"id": f"C{c + 1}", "state": "blocked (buffer empty)", "patient": None})
            else:
                cons.append({"id": f"C{c + 1}", "state": "serving", "patient": serving[c]})
        stats["max_occupancy"] = max(stats["max_occupancy"], len(buffer))
        frames.append({"t": t, "buffer": list(buffer), "backlog": [b[0] for b in backlog],
                       "producer": prod_state, "consumers": cons, "empty": empty.value, "full": full.value})
        if stats["consumed"] == total and all(s is None or busy_until[i] <= t + 1 for i, s in enumerate(serving)) and ai == total:
            break
        t += 1
    stats["avg_door_wait"] = round(stats["total_door_wait"] / stats["produced"], 3) if stats["produced"] else 0.0
    return {"capacity": capacity, "consumers": consumers, "service_time": service_time,
            "frames": frames, "stats": stats, "invariant_ok": all(0 <= len(f["buffer"]) <= capacity for f in frames)}
