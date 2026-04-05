const vscode = require('vscode')

const { getBaseUrl, getProjectId, shouldShowStatusBar } = require('./config')

class StatusProvider {
  constructor(output) {
    this.output = output
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99)
    this.statusBar.command = 'devlog.openPanel'
    this._timer = null
    this._state = null
    this._fileStatus = {}
  }

  start() {
    if (!shouldShowStatusBar()) return
    this.statusBar.show()
    void this.pollNow()
    this._timer = setInterval(() => void this.pollNow(), 10000)
  }

  stop() {
    if (this._timer) clearInterval(this._timer)
    this._timer = null
    this.statusBar.dispose()
  }

  getState() {
    return this._state
  }

  getFileStatus(filePath) {
    return this._fileStatus[filePath] || null
  }

  async pollNow() {
    try {
      const response = await fetch(`${getBaseUrl().replace(/\/$/, '')}/devlog?projectId=${encodeURIComponent(getProjectId())}`)
      if (!response.ok) {
        throw new Error(`Status poll failed: ${response.status}`)
      }
      const data = await response.json()
      this._state = data
      this._updateFileStatus(data)
      this._updateStatusBar(data)
      return data
    } catch (err) {
      this.statusBar.text = '$(error) DevLog offline'
      this.statusBar.tooltip = err.message
      this.output.appendLine(`[status] ${err.message}`)
      return null
    }
  }

  _updateStatusBar(data) {
    const health = data.projectHealth || (data.risks?.length ? 'yellow' : 'green')
    const icon = health === 'red' ? '$(error)' : health === 'yellow' ? '$(warning)' : '$(pass)'
    const todos = (data.activeTodos || []).length
    const updatedAt = data.updatedAt || data.last_updated
    const timeLabel = updatedAt ? new Date(updatedAt).toLocaleTimeString() : '--'
    this.statusBar.text = `${icon} DevLog ${todos} todo${todos === 1 ? '' : 's'} ${timeLabel}`
    this.statusBar.tooltip = `Project health: ${health}\nLast update: ${timeLabel}`
    this.statusBar.backgroundColor = health === 'red'
      ? new vscode.ThemeColor('statusBarItem.errorBackground')
      : undefined
  }

  _updateFileStatus(data) {
    this._fileStatus = {}
    for (const entry of data.timeline || []) {
      if (!entry.filePath || this._fileStatus[entry.filePath]) continue
      this._fileStatus[entry.filePath] = {
        status: entry.riskFlag ? 'danger' : 'working',
        reason: entry.riskFlag || entry.summary,
        classification: entry.classification,
        lastChanged: entry.timestamp,
      }
    }
    for (const risk of data.risks || []) {
      const match = String(risk).match(/Review\s+(.+?)(?:[.;]|$)/i)
      if (!match) continue
      const filePath = match[1]
      this._fileStatus[filePath] = {
        ...(this._fileStatus[filePath] || {}),
        status: 'danger',
        reason: risk,
      }
    }
  }
}

module.exports = { StatusProvider }
