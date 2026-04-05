# DevLog AI

DevLog AI is a local-first vibe-coding memory layer with a FastAPI backend, a Python file watcher, and a React dashboard. It watches meaningful project changes, summarizes them into a living markdown document, and keeps a running handoff for the next session or teammate.

## Structure

- `agent/` local watcher that detects file saves, computes diffs, and syncs markdown
- `server/` FastAPI API with local persistence and optional Vertex AI / Firestore adapters
- `web/` React dashboard for timeline, state, notes, queries, and handoffs
- `extension/` VS Code extension for file explanations and Mermaid diagrams in the IDE
- `devlog/` generated markdown mirror plus local data/snapshot files

## Quick start

### 1. Backend

```powershell
py -3.13 -m venv .venv313
.venv313\Scripts\Activate.ps1
pip install -r server\requirements.txt -r agent\requirements.txt
uvicorn server.app.main:app --reload
```

### 2. Frontend

```powershell
cd web
npm install
npm run dev
```

### 3. Watcher agent

```powershell
.venv313\Scripts\python agent\main.py --project-root . --backend-url http://localhost:8000 --project-id default
```

The watcher will mirror the latest living document to `devlog/project.md`.

### 4. VS Code extension

Open `extension/README.md` and run the extension in a VS Code Extension Development Host. The extension talks to the local backend and can:

- explain the current file or selection
- render dependency, flow, class, and architecture diagrams
- show textual summaries plus Mermaid inside a webview panel

## Environment

Copy `server/.env.example` to `server/.env` if you want to enable GCP adapters.

- Local mode works out of the box with JSON persistence under `devlog/data/`.
- Vertex AI is used when `DEVLOG_USE_VERTEX=true`.
- Firestore is used when `DEVLOG_USE_FIRESTORE=true`.
- On this machine, Python `3.13` is required because the pinned `pydantic-core` wheel does not currently install cleanly on Python `3.14`.

## Google setup when ready

You do not need API keys for the local-first mode. To upgrade this into the Google-track version, you will need:

1. A Google Cloud project with **Vertex AI** enabled
2. Application Default Credentials or a service account exposed through `GOOGLE_APPLICATION_CREDENTIALS`
3. `server/.env` with:

```env
DEVLOG_USE_VERTEX=true
DEVLOG_GOOGLE_CLOUD_PROJECT=your-project-id
DEVLOG_GCP_LOCATION=us-central1
DEVLOG_GEMINI_MODEL=gemini-1.5-pro
```

After that, the same explain/diagram endpoints can use Gemini to sharpen summaries and architecture descriptions without changing the IDE extension surface.

## Implemented MVP

- Debounced file watcher with ignore rules
- `POST /events`, `POST /notes`, `GET /timeline`, `POST /query`, `POST /handoff`, `GET /state`
- `POST /explain/file`, `POST /diagram`, `POST /architecture/map`, `POST /search/code`
- Living markdown generation
- Timeline, state, note, query, and handoff dashboard
- VS Code extension surface for in-IDE visual and textual explanations
- Local persistence with optional GCP-backed adapters
