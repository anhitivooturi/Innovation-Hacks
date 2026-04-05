const vscode = require('vscode')

// WebviewViewProvider — renders the compact sidebar panel
class SidebarProvider {
  constructor(extensionUri, statusProvider, output) {
    this._extensionUri = extensionUri
    this._status = statusProvider
    this._output = output
    this._view = null
    // Poll Firestore decisions via backend every 8s
    this._decisionTimer = null
    this._decisions = []
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView
    webviewView.webview.options = { enableScripts: true }
    this._render()

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'query') {
        await this._handleQuery(msg.text)
      } else if (msg.type === 'handoff') {
        await this._handleHandoff()
      } else if (msg.type === 'openPanel') {
        vscode.commands.executeCommand('devlog.openPanel')
      }
    })

    this._startPolling()
  }

  refresh() {
    if (this._view) this._render()
  }

  _startPolling() {
    this._pollDecisions()
    this._decisionTimer = setInterval(() => {
      this._pollDecisions()
    }, 8_000)
  }

  async _pollDecisions() {
    try {
      const baseUrl = vscode.workspace.getConfiguration('devlog').get('apiBaseUrl', 'http://127.0.0.1:8000')
      const res = await fetch(`${baseUrl}/decisions?projectId=${getProjectId()}&limit=3`)
      if (!res.ok) return
      const data = await res.json()
      const incoming = data.decisions || []
      const changed = JSON.stringify(incoming) !== JSON.stringify(this._decisions)
      this._decisions = incoming
      if (changed && this._view) {
        this._render()
        // Flash indicator for new decision
        vscode.window.setStatusBarMessage('$(bell) New decision logged in DevLog', 3000)
      }
    } catch {
      // backend not up yet — silent fail
    }
  }

  _render() {
    if (!this._view) return
    const state = this._status.getState()
    const decisions = this._decisions
    const nonce = String(Date.now())
    this._view.webview.html = buildHtml(state, decisions, nonce)
  }

  async _handleQuery(text) {
    if (!text?.trim()) return
    try {
      const baseUrl = vscode.workspace.getConfiguration('devlog').get('apiBaseUrl', 'http://127.0.0.1:8000')
      const res = await fetch(`${baseUrl}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: getProjectId(), query: text }),
      })
      const data = await res.json()
      this._view?.webview.postMessage({ type: 'queryResult', answer: data.answer || data.response || JSON.stringify(data) })
    } catch (err) {
      this._view?.webview.postMessage({ type: 'queryResult', answer: `Error: ${err.message}` })
    }
  }

  async _handleHandoff() {
    try {
      const baseUrl = vscode.workspace.getConfiguration('devlog').get('apiBaseUrl', 'http://127.0.0.1:8000')
      const res = await fetch(`${baseUrl}/handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: getProjectId() }),
      })
      const data = await res.json()
      const doc = data.handoff || data.content || JSON.stringify(data, null, 2)
      this._view?.webview.postMessage({ type: 'handoffResult', content: doc })
    } catch (err) {
      this._view?.webview.postMessage({ type: 'handoffResult', content: `Error: ${err.message}` })
    }
  }
}

function getProjectId() {
  return vscode.workspace.getConfiguration('devlog').get('projectId', 'default')
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function healthIcon(state) {
  if (!state) return '⚪'
  const risks = (state.risks || []).length
  if (risks >= 2) return '🔴'
  if (risks === 1) return '🟡'
  return '🟢'
}

function sourceIcon(source) {
  const s = (source || '').toLowerCase()
  if (s.includes('claude')) return '🟣'
  if (s.includes('cursor')) return '🟢'
  if (s.includes('chatgpt') || s.includes('openai')) return '🔵'
  return '🟡'
}

function buildHtml(state, decisions, nonce) {
  const todos = (state?.activeTodos || []).slice(0, 3)
  const risks = (state?.risks || []).slice(0, 3)
  const ts = state?.updatedAt ? new Date(state.updatedAt).toLocaleTimeString() : '—'
  const health = healthIcon(state)

  const todosHtml = todos.length
    ? todos.map(t => `<li>${esc(t)}</li>`).join('')
    : '<li class="muted">No open todos</li>'

  const risksHtml = risks.length
    ? risks.map(r => `<li class="danger">${esc(r)}</li>`).join('')
    : '<li class="muted">No danger zones</li>'

  const decisionsHtml = decisions.length
    ? decisions.map(d => `
        <li>
          <span class="badge">${sourceIcon(d.source)} ${esc(d.source || 'user')}</span>
          <span>${esc(d.decision || d.content || '')}</span>
        </li>`).join('')
    : '<li class="muted">No decisions yet</li>'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>
    body { font-family: var(--vscode-font-family); font-size: 12px; color: var(--vscode-foreground); padding: 8px; margin: 0; }
    h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; margin: 12px 0 4px; color: var(--vscode-descriptionForeground); }
    ul { margin: 0 0 8px; padding-left: 14px; }
    li { margin-bottom: 4px; line-height: 1.4; }
    .muted { color: var(--vscode-descriptionForeground); }
    .danger { color: var(--vscode-list-errorForeground, #f44); }
    .badge { font-size: 10px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 4px; padding: 1px 4px; margin-right: 4px; }
    .health { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
    .ts { font-size: 10px; color: var(--vscode-descriptionForeground); }
    textarea { width: 100%; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 4px; font-size: 12px; resize: vertical; }
    button { margin-top: 4px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; padding: 4px 10px; cursor: pointer; font-size: 12px; }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    #answer { margin-top: 8px; padding: 6px; background: var(--vscode-editor-background); border-radius: 4px; white-space: pre-wrap; font-size: 11px; display: none; }
    #handoff-modal { display: none; position: fixed; inset: 0; background: var(--vscode-editor-background); padding: 12px; overflow: auto; z-index: 10; }
    #handoff-modal pre { white-space: pre-wrap; font-size: 11px; }
    .row { display: flex; gap: 6px; }
  </style>
</head>
<body>
  <div class="health">${health} Project Health</div>
  <div class="ts">Last update: ${esc(ts)}</div>

  <h3>Open Todos</h3>
  <ul>${todosHtml}</ul>

  <h3>Danger Zones</h3>
  <ul>${risksHtml}</ul>

  <h3>Recent Decisions</h3>
  <ul id="decisions-list">${decisionsHtml}</ul>

  <h3>Ask DevLog</h3>
  <textarea id="query-input" rows="2" placeholder="What broke last? What's left to build?"></textarea>
  <div class="row">
    <button id="ask-btn">Ask</button>
    <button class="secondary" id="handoff-btn">Generate Handoff</button>
  </div>
  <div id="answer"></div>

  <div id="handoff-modal">
    <div class="row" style="margin-bottom:8px">
      <button id="copy-btn">Copy</button>
      <button class="secondary" id="close-modal-btn">Close</button>
    </div>
    <pre id="handoff-content"></pre>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    document.getElementById('ask-btn').addEventListener('click', () => {
      const text = document.getElementById('query-input').value.trim();
      if (!text) return;
      document.getElementById('answer').style.display = 'block';
      document.getElementById('answer').textContent = 'Thinking…';
      vscode.postMessage({ type: 'query', text });
    });

    document.getElementById('handoff-btn').addEventListener('click', () => {
      document.getElementById('handoff-content').textContent = 'Generating…';
      document.getElementById('handoff-modal').style.display = 'block';
      vscode.postMessage({ type: 'handoff' });
    });

    document.getElementById('close-modal-btn').addEventListener('click', () => {
      document.getElementById('handoff-modal').style.display = 'none';
    });

    document.getElementById('copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(document.getElementById('handoff-content').textContent);
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'queryResult') {
        document.getElementById('answer').textContent = msg.answer;
      } else if (msg.type === 'handoffResult') {
        document.getElementById('handoff-content').textContent = msg.content;
      } else if (msg.type === 'decisionsUpdate') {
        document.getElementById('decisions-list').innerHTML = msg.html;
      }
    });
  </script>
</body>
</html>`
}

module.exports = { SidebarProvider }
