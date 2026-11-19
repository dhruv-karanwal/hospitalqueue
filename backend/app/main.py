"""FastAPI routes. Engine logic lives in app/engine and stays pure."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .models import Health

API_HOST = "127.0.0.1"  # loopback only, never 0.0.0.0
API_PORT = 8000

app = FastAPI(title="MediQueue OS", version=__version__)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health", response_model=Health)
def health() -> Health:
    return Health(status="ok", app="MediQueue OS", version=__version__)


def run() -> None:
    import uvicorn

    uvicorn.run("app.main:app", host=API_HOST, port=API_PORT, reload=False)


if __name__ == "__main__":
    run()
