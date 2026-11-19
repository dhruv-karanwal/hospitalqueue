# MediQueue OS — one command each for backend, frontend and tests.
PY ?= python3.11
VENV := backend/.venv
VPY := $(VENV)/bin/python

.PHONY: setup backend frontend test test-backend test-frontend build clean

setup: $(VENV)/.installed frontend/node_modules

$(VENV)/.installed: backend/requirements.txt
	$(PY) -m venv $(VENV)
	$(VPY) -m pip install -q -r backend/requirements.txt
	touch $@

frontend/node_modules: frontend/package.json
	cd frontend && npm install --no-audit --no-fund
	touch $@

backend: $(VENV)/.installed        ## API on http://127.0.0.1:8000
	cd backend && .venv/bin/python -m app.main

frontend: frontend/node_modules    ## UI on http://127.0.0.1:5173 (proxies /api)
	cd frontend && npm run dev

test: test-backend test-frontend build

test-backend: $(VENV)/.installed
	cd backend && .venv/bin/python -m pytest

test-frontend: frontend/node_modules
	cd frontend && npm test

build: frontend/node_modules
	cd frontend && npm run build

clean:
	rm -rf frontend/dist backend/.pytest_cache
