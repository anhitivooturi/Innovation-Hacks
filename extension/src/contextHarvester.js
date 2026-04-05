const vscode = require('vscode')

const { getBaseUrl, getProjectId } = require('./config')

// Collects file tree, diagnostics, git history and POSTs to /context every 30s
class ContextHarvester {
  constructor(output) {
    this.output = output
    this._timer = null
  }

  start() {
    this._post()
    this._timer = setInterval(() => this._post(), 30_000)
  }

  stop() {
    if (this._timer) clearInterval(this._timer)
  }

  async _post() {
    try {
      const [fileTree, diagnostics, gitLog] = await Promise.all([
        this._getFileTree(),
        this._getDiagnostics(),
        this._getGitLog(),
      ])

      const payload = {
        projectId: getProjectId(),
        fileTree,
        diagnostics,
        gitLog,
        timestamp: new Date().toISOString(),
      }

      await postJson('/context', payload, this.output)
    } catch (err) {
      this.output.appendLine(`[ContextHarvester] ${err.message}`)
    }
  }

  async _getFileTree() {
    const folders = vscode.workspace.workspaceFolders
    if (!folders) return []
    const entries = await vscode.workspace.findFiles(
      '**/*',
      '{**/node_modules/**,**/.git/**,**/dist/**,**/__pycache__/**,**/.venv/**,**/.venv313/**,**/devlog/**,**/.tmp_extension_branch/**}',
      200,
    )
    return entries.map(uri => vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/'))
  }

  _getDiagnostics() {
    const result = []
    for (const [uri, diags] of vscode.languages.getDiagnostics()) {
      const filePath = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/')
      for (const d of diags) {
        if (d.severity === vscode.DiagnosticSeverity.Error || d.severity === vscode.DiagnosticSeverity.Warning) {
          result.push({
            filePath,
            line: d.range.start.line + 1,
            severity: d.severity === vscode.DiagnosticSeverity.Error ? 'error' : 'warning',
            message: d.message,
          })
        }
      }
    }
    return result
  }

  async _getGitLog() {
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git')
      if (!gitExtension) return []
      const git = gitExtension.exports.getAPI(1)
      const repo = git.repositories[0]
      if (!repo) return []
      const commits = await repo.log({ maxEntries: 10 })
      return commits.map(c => ({
        hash: c.hash.slice(0, 7),
        message: c.message,
        author: c.authorName,
        date: c.authorDate?.toISOString(),
      }))
    } catch {
      return []
    }
  }
}

async function postJson(path, body, output) {
  const res = await fetch(`${getBaseUrl().replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const msg = await res.text()
    output?.appendLine(`[context POST] ${res.status} ${msg}`)
  }
}

module.exports = { ContextHarvester }
