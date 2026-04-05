const vscode = require('vscode')

// Sidebar nav — quick access to all panel views
class SidebarProvider {
  constructor(extensionUri, statusProvider, output) {
    this._view = null
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView
    webviewView.webview.options = { enableScripts: true }
    webviewView.webview.html = buildNavHtml()
    webviewView.webview.onDidReceiveMessage(msg => {
      if (msg.command) vscode.commands.executeCommand(msg.command)
    })
  }

  refresh() {} // no-op, sidebar is static nav
}

function buildNavHtml() {
  const nonce = String(Date.now())
  const items = [
    { icon: '🏠', label: 'Open Explorer',      cmd: 'devlog.openPanel' },
    { icon: '🏗️', label: 'Architecture',        cmd: 'devlog.showArchitectureMap' },
    { icon: '🔗', label: 'Dependencies',        cmd: 'devlog.showDependencyDiagram' },
    { icon: '🔀', label: 'Flow Chart',          cmd: 'devlog.showFlowDiagram' },
    { icon: '🧱', label: 'Class / UML',         cmd: 'devlog.showClassDiagram' },
    { icon: '📄', label: 'Explain Current File',cmd: 'devlog.explainCurrentFile' },
    { icon: '✂️', label: 'Explain Selection',   cmd: 'devlog.explainSelection' },
    { icon: '🔍', label: 'Search Code',         cmd: 'devlog.searchCode' },
  ]

  const btns = items.map(i => `
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
    body{font-family:var(--vscode-font-family);padding:8px;margin:0}
    .nav-btn{display:flex;align-items:center;gap:8px;width:100%;background:none;border:none;color:var(--vscode-foreground);padding:7px 8px;border-radius:6px;cursor:pointer;font-size:12px;text-align:left}
    .nav-btn:hover{background:var(--vscode-list-hoverBackground)}
    .nav-icon{font-size:14px;width:20px;text-align:center}
    .section-label{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground);padding:10px 8px 4px;font-weight:600}
  </style>
</head>
<body>
  <div class="section-label">DevLog Explorer</div>
  ${btns}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi()
    document.querySelectorAll('.nav-btn').forEach(b =>
      b.addEventListener('click', () => vscode.postMessage({ command: b.dataset.cmd }))
    )
  </script>
</body>
</html>`
}

module.exports = { SidebarProvider }
