const vscode = require('vscode')

// Polls /devlog every 10s and drives status bar + file decorations
class StatusProvider {
  constructor(output) {
    this.output = output
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99)
    this.statusBar.command = 'devlog.openPanel'
    this._decorationType = this._buildDecorationType()
    this._state = null
    this._timer = null
    // file-level status map: filePath -> { status, reason, classification }
    this._fileStatus = {}
  }

  start() {
    this.statusBar.show()
    this._poll()
    this._timer = setInterval(() => this._poll(), 10_000)
  }

  stop() {
    if (this._timer) clearInterval(this._timer)
    this.statusBar.dispose()
  }

  getState() {
    return this._state
  }

  getFileStatus(filePath) {
    return this._fileStatus[filePath] || null
  }

  async _poll() {
    try {
      const baseUrl = vscode.workspace.getConfiguration('devlog').get('apiBaseUrl', 'http://127.0.0.1:8000')
      const res = await fetch(`${baseUrl}/devlog?projectId=${getProjectId()}`)
      if (!res.ok) return
      const data = await res.json()
      this._state = data
      this._updateStatusBar(data)
      this._updateFileStatus(data)
    } catch (err) {
      this.output.appendLine(`[StatusProvider] ${err.message}`)
    }
  }

  _updateStatusBar(data) {
    const health = data.projectHealth || (data.risks?.length ? 'yellow' : 'green')
    const icon = health === 'red' ? '$(error)' : health === 'yellow' ? '$(warning)' : '$(pass)'
    const todos = (data.activeTodos || []).length
    const ts = data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString() : '—'
    this.statusBar.text = `${icon} DevLog  ${todos} todo${todos !== 1 ? 's' : ''}  ${ts}`
    this.statusBar.tooltip = `Project health: ${health}\nLast update: ${ts}`
    this.statusBar.backgroundColor = health === 'red'
      ? new vscode.ThemeColor('statusBarItem.errorBackground')
      : undefined
  }

  _updateFileStatus(data) {
    // Build file status from timeline risk flags
    this._fileStatus = {}
    for (const entry of (data.timeline || [])) {
      if (!this._fileStatus[entry.filePath]) {
        this._fileStatus[entry.filePath] = {
          status: entry.riskFlag ? 'danger' : 'working',
          reason: entry.riskFlag || entry.summary,
          classification: entry.classification,
          lastChanged: entry.timestamp,
        }
      }
    }
    // Mark danger zones explicitly
    for (const risk of (data.risks || [])) {
      const match = risk.match(/Review (.+?);/)
      if (match) {
        const fp = match[1]
        if (this._fileStatus[fp]) this._fileStatus[fp].status = 'danger'
        else this._fileStatus[fp] = { status: 'danger', reason: risk }
      }
    }
  }

  _buildDecorationType() {
    return vscode.window.createTextEditorDecorationType({
      gutterIconPath: undefined, // gutter icons set per-editor below
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    })
  }
}

function getProjectId() {
  return vscode.workspace.getConfiguration('devlog').get('projectId', 'default')
}

module.exports = { StatusProvider }
