# DevLog AI VS Code Extension

This extension is wired to the local `api/` + `watcher/` stack in this workspace.

It provides:

- architecture, dependency, flow, class, and sequence diagrams
- grounded file explanations
- code search routed through the local backend
- sidebar query and handoff actions
- ElevenLabs TTS with browser speech fallback

## Local usage

1. Open the repo in VS Code.
2. Press `F5` and choose `Run DevLog Extension`.
3. In the Extension Development Host, use the `DevLog` activity-bar view, status bar item, or Command Palette.

By default the extension tries to auto-start:

- `py -3.13 -m uvicorn api.main:app --host 127.0.0.1 --port 8000`
- `py -3.13 watcher/watcher.py`

Auto-start is used only when `devlog.apiBaseUrl` is local and `devlog.autoStartLocalServices` is enabled.

## Commands

- `DevLog: Open Project Copilot`
- `DevLog: Explain Current File`
- `DevLog: Explain Selection`
- `DevLog: Show Dependency Diagram`
- `DevLog: Show Flow Diagram`
- `DevLog: Show Class Diagram`
- `DevLog: Show Architecture Map`
- `DevLog: Search Code`
- `DevLog: Refresh Panel`

## Settings

- `devlog.apiBaseUrl`: backend URL, defaults to `http://127.0.0.1:8000`
- `devlog.projectId`: project identifier sent to the backend
- `devlog.autoStartLocalServices`: auto-start local API and watcher
- `devlog.pythonCommand`: Python command for local API and watcher, defaults to `py -3.13`
- `devlog.showStatusBar`: toggle the DevLog status bar item
- `devlog.elevenLabsApiKey`: optional ElevenLabs API key
- `devlog.elevenLabsVoiceId`: optional ElevenLabs voice ID
