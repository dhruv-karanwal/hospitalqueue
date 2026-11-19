"""SQLite persistence (stdlib sqlite3): saved scenarios and run history.

Parameterised queries only. The path can be overridden with MEDIQUEUE_DB (tests use a temp file).
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
from contextlib import closing
from pathlib import Path

DEFAULT_PATH = Path(__file__).resolve().parents[1] / "data" / "mediqueue.sqlite3"

SCHEMA = """
CREATE TABLE IF NOT EXISTS scenarios (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
    payload TEXT NOT NULL, created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, created_at REAL NOT NULL, policy TEXT NOT NULL,
    patients INTEGER NOT NULL, doctors INTEGER NOT NULL, metrics TEXT NOT NULL
);
"""


def db_path() -> Path:
    return Path(os.environ.get("MEDIQUEUE_DB", DEFAULT_PATH))


def connect() -> sqlite3.Connection:
    p = db_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(p)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with closing(connect()) as c, c:
        c.executescript(SCHEMA)


def save_scenario(sid: str, title: str, description: str, payload: dict) -> None:
    with closing(connect()) as c, c:
        c.execute("INSERT OR REPLACE INTO scenarios (id, title, description, payload, created_at) VALUES (?,?,?,?,?)",
                  (sid, title, description, json.dumps(payload), time.time()))


def list_scenarios() -> list[dict]:
    with closing(connect()) as c:
        rows = c.execute("SELECT id, title, description, created_at FROM scenarios ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


def get_scenario(sid: str) -> dict | None:
    with closing(connect()) as c:
        r = c.execute("SELECT payload FROM scenarios WHERE id = ?", (sid,)).fetchone()
    return json.loads(r["payload"]) if r else None


def delete_scenario(sid: str) -> bool:
    with closing(connect()) as c, c:
        return c.execute("DELETE FROM scenarios WHERE id = ?", (sid,)).rowcount > 0


def record_run(policy: str, patients: int, doctors: int, metrics: dict) -> int:
    with closing(connect()) as c, c:
        cur = c.execute("INSERT INTO runs (created_at, policy, patients, doctors, metrics) VALUES (?,?,?,?,?)",
                        (time.time(), policy, patients, doctors, json.dumps(metrics)))
        c.execute("DELETE FROM runs WHERE id NOT IN (SELECT id FROM runs ORDER BY id DESC LIMIT 200)")
        return cur.lastrowid


def list_runs(limit: int = 20) -> list[dict]:
    with closing(connect()) as c:
        rows = c.execute("SELECT * FROM runs ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [{**dict(r), "metrics": json.loads(r["metrics"])} for r in rows]
