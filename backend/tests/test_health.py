"""Health check and app wiring."""
from app.main import API_HOST


def test_health_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and body["app"] == "MediQueue OS" and "version" in body


def test_unknown_route_404(client):
    assert client.get("/api/does-not-exist").status_code == 404


def test_api_binds_loopback_only():
    assert API_HOST == "127.0.0.1"
