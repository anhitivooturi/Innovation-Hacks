# DevLog AI VS Code Extension

This extension adds an in-IDE surface for DevLog AI:

- Explain the current file or selected code
- Render dependency, flow, class, and architecture diagrams
- Show Mermaid plus a plain-English explanation in a webview panel
- Search the codebase through the DevLog backend
- Open a status bar shortcut and sidebar actions for common workflows

## Local usage

1. Start the DevLog backend at `http://127.0.0.1:8000`
2. Open the repo in VS Code
3. Press `F5` and choose `Run DevLog Extension`
4. In the Extension Development Host, use either the `DevLog` activity-bar view, the status bar button, or the Command Palette
5. Run commands such as:
   - `DevLog: Explain Current File`
   - `DevLog: Explain Selection`
   - `DevLog: Show Dependency Diagram`
   - `DevLog: Show Flow Diagram`
   - `DevLog: Show Class Diagram`
   - `DevLog: Show Architecture Map`
   - `DevLog: Search Code`
   - `DevLog: Refresh Panel`

The activity bar also exposes a `DevLog` view with the same actions.

## Settings

- `devlog.apiBaseUrl`: backend URL, defaults to `http://127.0.0.1:8000`
- `devlog.projectId`: project identifier sent to the backend, defaults to `default`
- `devlog.showStatusBar`: toggles the DevLog status bar shortcut
