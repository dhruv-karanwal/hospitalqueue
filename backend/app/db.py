"""SQLite persistence (stdlib sqlite3). Implemented in milestone 9."""
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "mediqueue.sqlite3"
