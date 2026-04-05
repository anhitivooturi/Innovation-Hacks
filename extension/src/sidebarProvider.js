const vscode = require('vscode')

const { getBaseUrl, getProjectId } = require('./config')

class SidebarProvider {
  constructor(extensionUri, statusProvider, output) {
    this.extensionUri = extensionUri
    this.statusProvider = statusProvider
    this.output = output
    this._view = null
    this._timer = setInterval(() => void this._fetchData(), 30000)
    this._data = {
      health: { status: 'unknown', firestore_available: false, vertex_available: false },
      devlog: { projectHealth: 'unknown', activeTodos: [], timeline: [] },
    }
  }

  dispose() {
    if (this._timer) clearInterval(this._timer)
    this._timer = null
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView
    webviewView.webview.options = { enableScripts: true }
    webviewView.webview.html = this._buildHtml(webviewView.webview)
    webviewView.webview.onDidReceiveMessage(async msg => {
      if (msg.command) {
        await vscode.commands.executeCommand(msg.command)
        return
      }
      if (msg.type === 'refresh') {
        await this._fetchData()
        return
      }
      if (msg.type === 'askDevlog') {
        await this._handleQuery(msg.question)
        return
      }
      if (msg.type === 'generateHandoff') {
        await this._handleHandoff()
      }
    })
    void this._fetchData()
  }

  refresh() {
    if (!this._view) return
    this._view.webview.html = this._buildHtml(this._view.webview)
  }

  async _fetchData() {
    try {
      const baseUrl = getBaseUrl().replace(/\/$/, '')
      const [healthResponse, devlogResponse] = await Promise.all([
        fetch(`${baseUrl}/health`),
        fetch(`${baseUrl}/devlog?projectId=${encodeURIComponent(getProjectId())}`),
      ])

      if (healthResponse.ok) this._data.health = await healthResponse.json()
      if (devlogResponse.ok) this._data.devlog = await devlogResponse.json()
    } catch (err) {
      this.output.appendLine(`[sidebar] ${err.message}`)
    }
    this.refresh()
  }

  async _handleQuery(question) {
    const trimmed = String(question || '').trim()
    if (!trimmed) return
    try {
      const response = await fetch(`${getBaseUrl().replace(/\/$/, '')}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: getProjectId(), question: trimmed }),
      })
      if (!response.ok) {
        throw new Error(`Query failed: ${response.status}`)
      }
      const data = await response.json()
      this.output.appendLine(`\n[DevLog Query] ${trimmed}`)
      this.output.appendLine(`[Answer] ${data.answer}\n`)
      this.output.show(true)
      vscode.window.showInformationMessage(`DevLog: ${String(data.answer).slice(0, 180)}`)
    } catch (err) {
      vscode.window.showErrorMessage(`DevLog query failed: ${err.message}`)
    }
  }

  async _handleHandoff() {
    try {
      const response = await fetch(`${getBaseUrl().replace(/\/$/, '')}/handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: getProjectId(), recipient: 'Team' }),
      })
      if (!response.ok) {
        throw new Error(`Handoff failed: ${response.status}`)
      }
      const data = await response.json()
      this.output.appendLine('\n' + '='.repeat(60))
      this.output.appendLine('HANDOFF DOCUMENT')
      this.output.appendLine('='.repeat(60) + '\n')
      this.output.appendLine(data.handoff_document || data.handoff || '')
      this.output.appendLine('\n' + '='.repeat(60) + '\n')
      this.output.show(true)
      vscode.window.showInformationMessage('DevLog handoff generated in the output panel.')
    } catch (err) {
      vscode.window.showErrorMessage(`DevLog handoff failed: ${err.message}`)
    }
  }

  _buildHtml(webview) {
    const nonce = String(Date.now())
    const health = this._data.health
    const devlog = this._data.devlog
    const projectHealth = devlog.projectHealth || 'unknown'
    const changes = (devlog.timeline || []).slice(0, 5)
    const todos = (devlog.activeTodos || []).slice(0, 5)

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; display: grid; gap: 14px; }
    .card { border: 1px solid var(--vscode-panel-border); border-radius: 10px; padding: 12px; }
    .title { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.5; }
    .change { padding: 8px 0; border-top: 1px solid var(--vscode-panel-border); }
    .change:first-child { border-top: none; padding-top: 0; }
    .file { color: var(--vscode-textLink-foreground); font-size: 12px; }
    .summary { font-size: 12px; color: var(--vscode-descriptionForeground); }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 6px; padding: 6px 10px; cursor: pointer; }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .row { display: flex; gap: 8px; flex-wrap: wrap; }
    input { width: 100%; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 6px; padding: 7px 9px; }
    ul { margin: 0; padding-left: 18px; color: var(--vscode-descriptionForeground); font-size: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="title">Runtime</div>
    <div class="meta">Project health: <strong>${escapeHtml(projectHealth)}</strong></div>
    <div class="meta">Firestore: ${health.firestore_available ? 'ready' : 'unavailable'}</div>
    <div class="meta">Vertex: ${health.vertex_available ? 'ready' : 'unavailable'}</div>
    <div class="meta">Last update: ${escapeHtml(devlog.updatedAt || devlog.last_updated || '--')}</div>
  </div>

  <div class="card">
    <div class="title">Actions</div>
    <div class="row">
      <button data-command="devlog.openPanel">Open Explorer</button>
      <button data-command="devlog.explainCurrentFile" class="secondary">Explain File</button>
      <button data-command="devlog.searchCode" class="secondary">Search Code</button>
    </div>
  </div>

  <div class="card">
    <div class="title">Ask DevLog</div>
    <input id="question" placeholder="What changed most recently?" />
    <div class="row" style="margin-top:8px;">
      <button data-action="ask">Ask</button>
      <button data-action="handoff" class="secondary">Generate Handoff</button>
      <button data-action="refresh" class="secondary">Refresh</button>
    </div>
  </div>

  <div class="card">
    <div class="title">Recent Changes</div>
    ${changes.length ? changes.map(change => `
      <div class="change">
        <div class="file">${escapeHtml(change.filePath || 'unknown')}</div>
        <div class="summary">${escapeHtml(change.summary || 'No summary')}</div>
      </div>
    `).join('') : '<div class="meta">No recent changes yet.</div>'}
  </div>

  <div class="card">
    <div class="title">Open Todos</div>
    ${todos.length ? `<ul>${todos.map(todo => `<li>${escapeHtml(todo)}</li>`).join('')}</ul>` : '<div class="meta">No open todos.</div>'}
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi()
    document.querySelectorAll('[data-command]').forEach(button => {
      button.addEventListener('click', () => vscode.postMessage({ command: button.dataset.command }))
    })
    document.querySelector('[data-action="refresh"]').addEventListener('click', () => {
      vscode.postMessage({ type: 'refresh' })
    })
    document.querySelector('[data-action="handoff"]').addEventListener('click', () => {
      vscode.postMessage({ type: 'generateHandoff' })
    })
    document.querySelector('[data-action="ask"]').addEventListener('click', () => {
      const question = document.getElementById('question').value.trim()
      if (!question) return
      vscode.postMessage({ type: 'askDevlog', question })
    })
    document.getElementById('question').addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        const question = event.target.value.trim()
        if (!question) return
        vscode.postMessage({ type: 'askDevlog', question })
      }
    })
  </script>
</body>
</html>`
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

module.exports = { SidebarProvider }
