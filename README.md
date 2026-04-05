# DevLog AI

DevLog AI is a local-first VS Code workflow for project memory, grounded code diagrams, and natural-language answers.

The canonical extension runtime in this workspace is now:

- `api/` for the local FastAPI backend
- `watcher/` for workspace file-change ingestion
- `extension/` for the VS Code UI

`server/`, `agent/`, and `web/` still exist in the repo, but they are no longer the source of truth for making the VS Code extension work.

## Quick start

### 1. Python environment

```powershell
py -3.13 -m venv .venv313
.venv313\Scripts\Activate.ps1
py -3.13 -m pip install -r api\requirements.txt -r agent\requirements.txt
```

Python `3.13` is required for the current local stack.

### 2. Google auth

Vertex AI and Firestore use Application Default Credentials:

```powershell
gcloud auth application-default login
```

The local API is configured for:

```env
DEVLOG_GOOGLE_CLOUD_PROJECT=project-5f6bf043-2561-48a7-af4
DEVLOG_GCP_LOCATION=us-central1
DEVLOG_GEMINI_FAST_MODEL=gemini-2.5-flash
DEVLOG_GEMINI_PRO_MODEL=gemini-2.5-pro
```

### 3. Run the local API manually

```powershell
py -3.13 -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --reload
```

### 4. Run the watcher manually

```powershell
$env:DEVLOG_WATCH_PATH = (Get-Location).Path
$env:DEVLOG_API_URL = "http://127.0.0.1:8000/change"
$env:DEVLOG_PROJECT_ID = "default"
py -3.13 watcher\watcher.py
```

### 5. Run the extension

Open the repo in VS Code and press `F5` with `Run DevLog Extension`.

The extension can also auto-start the local API and watcher when:

- `devlog.apiBaseUrl` is local
- `devlog.autoStartLocalServices` is `true`
- `devlog.pythonCommand` points at Python `3.13`

## Extension capabilities

- explain the current file or a selection
- render architecture, dependency, flow, class, and sequence diagrams
- search the workspace and jump into file explanations
- ask project questions backed by Firebase context and Vertex responses
- generate handoffs from the sidebar

## Environment files

The canonical local API env lives in `api/.env` and `api/.env.example`.

The extension expects the local backend at `http://127.0.0.1:8000` by default.

## Validation

Useful local checks:

```powershell
py -3.13 -c "import fastapi,uvicorn,watchdog,requests; import google.genai; import firebase_admin; print('ok')"
py -3.13 -m uvicorn api.main:app --host 127.0.0.1 --port 8000
```
