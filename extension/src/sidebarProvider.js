const vscode = require('vscode')
const https = require('https')

// DevLog AI Sidebar — shows real-time project status, recent changes, and query interface
class SidebarProvider {
  constructor(extensionUri, statusProvider, output) {
    this._view = null
    this._output = output
    this._apiUrl = 'https://devlog-backend-130030203761.us-central1.run.app'
    this._data = {
      health: 'unknown',
      recentChanges: [],
      todos: [],
      status: {}
    }

    // Auto-refresh every 30 seconds
    setInterval(() => this._fetchData(), 30000)
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView
    webviewView.webview.options = { enableScripts: true }
    webviewView.webview.html = this._buildHtml()

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async msg => {
      if (msg.command) {
        vscode.commands.executeCommand(msg.command)
      } else if (msg.type === 'askDevlog') {
        await this._handleQuery(msg.question)
      } else if (msg.type === 'generateHandoff') {
        await this._handleHandoff()
      } else if (msg.type === 'refresh') {
        await this._fetchData()
      }
    })

    // Initial data fetch
    this._fetchData()
  }

  async _fetchData() {
    try {
      // Fetch health status
      const health = await this._apiRequest('/health')
      this._data.health = health.firestore_available ? 'healthy' : 'local-only'

      // Fetch recent devlog (parse for changes)
      const devlog = await this._apiRequest('/devlog')
      this._data.recentChanges = this._parseRecentChanges(devlog.content)

      this.refresh()
    } catch (err) {
      this._output.appendLine(`[sidebar] fetch error: ${err.message}`)
      this._data.health = 'offline'
      this.refresh()
    }
  }

  _parseRecentChanges(content) {
    // Simple parser to extract last 5 changes from devlog markdown
    const lines = content.split('\n')
    const changes = []

    for (let i = 0; i < lines.length && changes.length < 5; i++) {
      const line = lines[i]
      if (line.includes('###') && line.includes('—')) {
        const parts = line.split('—')
        if (parts.length >= 2) {
          const classification = parts[1].trim()
          const fileMatch = lines[i + 2]?.match(/`([^`]+)`/)
          const file = fileMatch ? fileMatch[1] : 'unknown'
          const summary = lines[i + 4] || 'No summary'

          changes.push({
            classification: classification.toUpperCase(),
            file,
            summary: summary.replace('**Summary**: ', '').substring(0, 100)
          })
        }
      }
    }

    return changes
  }

  async _handleQuery(question) {
    try {
      this._updateStatus('Querying DevLog...')

      const response = await this._apiRequest('/query', {
        method: 'POST',
        body: JSON.stringify({ question })
      })

      vscode.window.showInformationMessage(
        `DevLog Answer: ${response.answer.substring(0, 200)}${response.answer.length > 200 ? '...' : ''}`,
        { modal: false }
      )

      this._output.appendLine(`\n[DevLog Query] ${question}`)
      this._output.appendLine(`[Answer] ${response.answer}\n`)
      this._output.show(true)

    } catch (err) {
      vscode.window.showErrorMessage(`Query failed: ${err.message}`)
    } finally {
      this._updateStatus('Ready')
    }
  }

  async _handleHandoff() {
    try {
      this._updateStatus('Generating handoff...')

      const response = await this._apiRequest('/handoff', {
        method: 'POST',
        body: JSON.stringify({ recipient: 'Team' })
      })

      // Show handoff in output channel
      this._output.appendLine('\n' + '='.repeat(60))
      this._output.appendLine('HANDOFF DOCUMENT')
      this._output.appendLine('='.repeat(60) + '\n')
      this._output.appendLine(response.handoff_document)
      this._output.appendLine('\n' + '='.repeat(60) + '\n')
      this._output.show(true)

      vscode.window.showInformationMessage('Handoff document generated! Check output panel.')

    } catch (err) {
      vscode.window.showErrorMessage(`Handoff generation failed: ${err.message}`)
    } finally {
      this._updateStatus('Ready')
    }
  }

  _apiRequest(endpoint, options = {}) {
    return new Promise((resolve, reject) => {
      const url = `${this._apiUrl}${endpoint}`
      const urlObj = new URL(url)

      const reqOptions = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        },
        timeout: 15000
      }

      const req = https.request(reqOptions, res => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch {
            resolve(data)
          }
        })
      })

      req.on('error', reject)
      req.on('timeout', () => reject(new Error('Request timeout')))

      if (options.body) req.write(options.body)
      req.end()
    })
  }

  _updateStatus(message) {
    if (this._view) {
      this._view.webview.postMessage({ type: 'status', message })
    }
  }

  refresh() {
    if (this._view) {
      this._view.webview.html = this._buildHtml()
    }
  }

  _buildHtml() {
    const nonce = String(Date.now())

    const healthColor = this._data.health === 'healthy' ? '#4ade80' :
                       this._data.health === 'local-only' ? '#fbbf24' : '#ef4444'

    const healthIcon = this._data.health === 'healthy' ? '✅' :
                      this._data.health === 'local-only' ? '⚠️' : '❌'

    const changesHtml = this._data.recentChanges.map(c => `
      <div class="change-item">
        <div class="change-badge">${c.classification.substring(0, 3)}</div>
        <div class="change-details">
          <div class="change-file">${c.file}</div>
          <div class="change-summary">${c.summary}</div>
        </div>
      </div>
    `).join('')

    const navItems = [
      { icon: '🏠', label: 'Open Explorer', cmd: 'devlog.openPanel' },
      { icon: '📄', label: 'Explain Current File', cmd: 'devlog.explainCurrentFile' },
      { icon: '🔍', label: 'Search Code', cmd: 'devlog.searchCode' },
    ]

    const navBtns = navItems.map(i => `
      <button class="nav-btn" data-cmd="${i.cmd}">
        <span class="nav-icon">${i.icon}</span>
        <span>${i.label}</span>
      </button>`).join('')

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>
    body{font-family:var(--vscode-font-family);padding:8px;margin:0;font-size:12px}
    .section-label{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground);padding:10px 8px 4px;font-weight:600}
    .health-status{display:flex;align-items:center;gap:8px;padding:8px;background:var(--vscode-editor-background);border-radius:6px;margin-bottom:12px}
    .health-dot{width:8px;height:8px;border-radius:50%;background:${healthColor}}
    .nav-btn,.action-btn{display:flex;align-items:center;gap:8px;width:100%;background:none;border:none;color:var(--vscode-foreground);padding:7px 8px;border-radius:6px;cursor:pointer;font-size:12px;text-align:left}
    .nav-btn:hover,.action-btn:hover{background:var(--vscode-list-hoverBackground)}
    .action-btn{background:var(--vscode-button-background);color:var(--vscode-button-foreground);justify-content:center;margin-top:4px}
    .action-btn:hover{background:var(--vscode-button-hoverBackground)}
    .nav-icon{font-size:14px;width:20px;text-align:center}
    .query-box{display:flex;gap:4px;margin:8px 0}
    .query-input{flex:1;padding:6px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:4px;font-size:12px}
    .query-btn{padding:6px 12px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:4px;cursor:pointer;font-size:12px}
    .query-btn:hover{background:var(--vscode-button-hoverBackground)}
    .change-item{display:flex;gap:8px;padding:8px;background:var(--vscode-editor-background);border-radius:6px;margin-bottom:6px}
    .change-badge{font-size:9px;font-weight:700;padding:2px 6px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);border-radius:4px;text-align:center;min-width:32px}
    .change-details{flex:1;overflow:hidden}
    .change-file{font-weight:600;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .change-summary{color:var(--vscode-descriptionForeground);font-size:10px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .status-message{text-align:center;padding:8px;font-size:11px;color:var(--vscode-descriptionForeground);font-style:italic}
  </style>
</head>
<body>
  <div class="health-status">
    <span>${healthIcon}</span>
    <span>Backend: <strong>${this._data.health}</strong></span>
    <button class="query-btn" style="margin-left:auto;padding:4px 8px" onclick="refresh()">🔄</button>
  </div>

  <div class="section-label">Ask DevLog</div>
  <div class="query-box">
    <input type="text" class="query-input" id="queryInput" placeholder="What changed last?" />
    <button class="query-btn" onclick="askQuestion()">Ask</button>
  </div>

  <div class="section-label">Recent Changes</div>
  ${changesHtml || '<div class="status-message">No changes yet</div>'}

  <div class="section-label" style="margin-top:16px">Actions</div>
  <button class="action-btn" onclick="generateHandoff()">📋 Generate Handoff</button>

  <div class="section-label" style="margin-top:16px">Quick Actions</div>
  ${navBtns}

  <div id="statusMsg" class="status-message"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi()

    function askQuestion() {
      const input = document.getElementById('queryInput')
      const question = input.value.trim()
      if (!question) return
      vscode.postMessage({ type: 'askDevlog', question })
      input.value = ''
      showStatus('Asking...')
    }

    function generateHandoff() {
      vscode.postMessage({ type: 'generateHandoff' })
      showStatus('Generating handoff...')
    }

    function refresh() {
      vscode.postMessage({ type: 'refresh' })
      showStatus('Refreshing...')
    }

    function showStatus(msg) {
      const el = document.getElementById('statusMsg')
      el.textContent = msg
      setTimeout(() => el.textContent = '', 3000)
    }

    document.getElementById('queryInput').addEventListener('keypress', e => {
      if (e.key === 'Enter') askQuestion()
    })

    document.querySelectorAll('.nav-btn').forEach(b =>
      b.addEventListener('click', () => vscode.postMessage({ command: b.dataset.cmd }))
    )

    window.addEventListener('message', event => {
      const msg = event.data
      if (msg.type === 'status') showStatus(msg.message)
    })
  </script>
</body>
</html>`
  }
}

module.exports = { SidebarProvider }
