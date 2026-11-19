"""Milestone 1: health check and app wiring."""
from fastapi.testclient import TestClient

from app.main import app, API_HOST

client = TestClient(app)


def test_health_ok():
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["app"] == "MediQueue OS"
    assert "version" in body


def test_unknown_route_404():
    assert client.get("/api/does-not-exist").status_code == 404


def test_api_binds_loopback_only():
    assert API_HOST == "127.0.0.1"
