const vscode = require('vscode')
const { ContextHarvester } = require('./contextHarvester')
const { StatusProvider } = require('./statusProvider')
const { FileTreeProvider } = require('./fileTreeProvider')
const { SidebarProvider } = require('./sidebarProvider')

function activate(context) {
  const output = vscode.window.createOutputChannel('DevLog AI')

  // Core services
  const statusProvider = new StatusProvider(output)
  const contextHarvester = new ContextHarvester(output)
  const fileTreeProvider = new FileTreeProvider(statusProvider)
  const sidebarProvider = new SidebarProvider(context.extensionUri, statusProvider, output)

  // Start background polling
  statusProvider.start()
  contextHarvester.start()

  // Refresh file tree whenever status updates
  const origPoll = statusProvider._poll.bind(statusProvider)
  statusProvider._poll = async function () {
    await origPoll()
    fileTreeProvider.refresh()
    sidebarProvider.refresh()
  }

  // Legacy panel (kept for diagram / explain commands)
  const panel = new DevLogPanel(context.extensionUri)

  context.subscriptions.push(
    output,
    // File tree view
    vscode.window.registerTreeDataProvider('devlogFileTree', fileTreeProvider),
    // Sidebar webview
    vscode.window.registerWebviewViewProvider('devlogSidebar', sidebarProvider),
    // Commands
    vscode.commands.registerCommand('devlog.openPanel', () => panel.showWelcome()),
    vscode.commands.registerCommand('devlog.explainCurrentFile', async () => {
      const payload = await buildFilePayload()
      if (!payload) return
      output.appendLine(`Explaining file: ${payload.filePath}`)
      const response = await postJson('/explain/file', payload, output)
      panel.showExplanation(response, payload.filePath)
    }),
    vscode.commands.registerCommand('devlog.explainSelection', async () => {
      const payload = await buildFilePayload(true)
      if (!payload) return
      output.appendLine(`Explaining selection in: ${payload.filePath}`)
      const response = await postJson('/explain/file', payload, output)
      panel.showExplanation(response, payload.filePath)
    }),
    vscode.commands.registerCommand('devlog.showDependencyDiagram', async () => {
      const payload = await buildDiagramPayload('dependency')
      if (!payload) return
      const response = await postJson('/diagram', payload, output)
      panel.showDiagram(response)
    }),
    vscode.commands.registerCommand('devlog.showFlowDiagram', async () => {
      const payload = await buildDiagramPayload('flow')
      if (!payload) return
      const response = await postJson('/diagram', payload, output)
      panel.showDiagram(response)
    }),
    vscode.commands.registerCommand('devlog.showClassDiagram', async () => {
      const payload = await buildDiagramPayload('class')
      if (!payload) return
      const response = await postJson('/diagram', payload, output)
      panel.showDiagram(response)
    }),
    vscode.commands.registerCommand('devlog.showArchitectureMap', async () => {
      output.appendLine('Generating workspace architecture map')
      const response = await postJson('/architecture/map', { projectId: getProjectId() }, output)
      panel.showArchitecture(response)
    }),
    vscode.commands.registerCommand('devlog.searchCode', async () => {
      const query = await vscode.window.showInputBox({ title: 'DevLog Search Code', placeHolder: 'Search for a symbol, method, route, or keyword' })
      if (!query) return
      const response = await postJson('/search/code', { projectId: getProjectId(), query, limit: 8 }, output)
      panel.showSearch(query, response.matches || [])
    }),
    vscode.commands.registerCommand('devlog.refreshPanel', async () => {
      const response = await postJson('/architecture/map', { projectId: getProjectId() }, output)
      panel.showArchitecture(response)
    }),
    vscode.commands.registerCommand('devlog.refreshFileTree', () => {
      fileTreeProvider.refresh()
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('devlog.showStatusBar')) {
        const show = vscode.workspace.getConfiguration('devlog').get('showStatusBar', true)
        show ? statusProvider.statusBar.show() : statusProvider.statusBar.hide()
      }
    }),
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function buildFilePayload(useSelection = false) {
  const editor = vscode.window.activeTextEditor
  if (!editor) { vscode.window.showWarningMessage('Open a file first.'); return null }
  const filePath = relativeWorkspacePath(editor.document.uri)
  const payload = { projectId: getProjectId(), filePath }
  if (useSelection && !editor.selection.isEmpty) {
    payload.selectionStartLine = editor.selection.start.line + 1
    payload.selectionEndLine = editor.selection.end.line + 1
  }
  return payload
}

async function buildDiagramPayload(kind) {
  const editor = vscode.window.activeTextEditor
  return { projectId: getProjectId(), kind, filePath: editor ? relativeWorkspacePath(editor.document.uri) : undefined }
}

function relativeWorkspacePath(uri) {
  return vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/')
}

async function postJson(path, body, output) {
  const baseUrl = vscode.workspace.getConfiguration('devlog').get('apiBaseUrl', 'http://127.0.0.1:8000')
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const msg = await res.text()
    output?.appendLine(`Request failed for ${path}: ${res.status} ${msg}`)
    vscode.window.showErrorMessage(`DevLog request failed: ${res.status}`)
    throw new Error(msg)
  }
  return res.json()
}

function getProjectId() {
  return vscode.workspace.getConfiguration('devlog').get('projectId', 'default')
}

// ── Legacy panel (diagrams / explain) ────────────────────────────────────────

class DevLogPanel {
  constructor(extensionUri) {
    this.extensionUri = extensionUri
    this.panel = undefined
  }

  showWelcome() {
    this._render({
      title: 'DevLog Project Copilot',
      subtitle: 'Use the commands in the sidebar or command palette to explain files and render diagrams.',
      mermaid: 'graph TD\n    A[Open a file] --> B[Run a DevLog command]\n    B --> C[See text + diagram here]',
      references: [],
      bodyTitle: 'What this panel does',
      body: ['Explains the current file or selected lines.', 'Generates Mermaid diagrams for dependencies, flow, classes, and architecture.'],
    })
  }

  showExplanation(response, filePath) {
    this._render({ title: response.title, subtitle: response.summary, mermaid: response.mermaid, references: response.references || [], bodyTitle: filePath, body: response.bullets || [], codeContext: response.codeContext || '' })
  }

  showDiagram(response) {
    this._render({ title: response.title, subtitle: response.explanation, mermaid: response.mermaid, references: response.references || [], bodyTitle: `${response.kind} diagram`, body: ['Diagram generated from the current workspace and file context.'] })
  }

  showArchitecture(response) {
    this._render({
      title: response.title, subtitle: response.summary, mermaid: response.mermaid,
      references: [...(response.entrypoints || []).map(f => ({ filePath: f, snippet: 'entrypoint' })), ...(response.hotspots || []).map(f => ({ filePath: f, snippet: 'hotspot' }))],
      bodyTitle: 'Workspace signals',
      body: [`Entrypoints: ${(response.entrypoints || []).join(', ') || 'none'}`, `Hotspots: ${(response.hotspots || []).join(', ') || 'none'}`],
    })
  }

  showSearch(query, matches) {
    this._render({
      title: `Search results for "${query}"`, subtitle: `Found ${matches.length} matching files or lines.`,
      mermaid: 'graph TD\n    Query[Search query] --> Results[Relevant files and symbols]',
      references: matches, bodyTitle: 'Matches', body: matches.map(m => `${m.filePath}${m.line ? `:${m.line}` : ''}`),
    })
  }

  _ensurePanel() {
    if (this.panel) { this.panel.reveal(vscode.ViewColumn.Beside); return this.panel }
    this.panel = vscode.window.createWebviewPanel('devlogPanel', 'DevLog Project Copilot', vscode.ViewColumn.Beside, { enableScripts: true })
    this.panel.onDidDispose(() => { this.panel = undefined })
    this.panel.webview.onDidReceiveMessage(async (message) => {
      if (message.command) await vscode.commands.executeCommand(message.command)
    })
    return this.panel
  }

  _render(content) {
    const panel = this._ensurePanel()
    const nonce = String(Date.now())
    const escaped = JSON.stringify(content).replace(/</g, '\\u003c')
    panel.title = content.title
    panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${panel.webview.cspSource} https:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; connect-src https:;">
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
</head>
<body style="font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:18px;">
  <div id="root"></div>
  <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const data = ${escaped};
    const root = document.getElementById('root');
    function esc(v){return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
    root.innerHTML = \`
      <style>
        .shell{display:grid;gap:16px}.hero{border:1px solid var(--vscode-panel-border);border-radius:16px;padding:16px}
        .row{display:flex;flex-wrap:wrap;gap:8px}button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:8px;padding:8px 12px;cursor:pointer}
        .panel{border:1px solid var(--vscode-panel-border);border-radius:14px;padding:14px}.mermaid-wrap{overflow:auto}
        pre{white-space:pre-wrap;font-family:var(--vscode-editor-font-family)}ul{padding-left:18px}.references li{margin-bottom:8px}
      </style>
      <div class="shell">
        <section class="hero">
          <div class="row">
            <button data-command="devlog.explainCurrentFile">Explain file</button>
            <button data-command="devlog.explainSelection">Explain selection</button>
            <button data-command="devlog.showDependencyDiagram">Dependency</button>
            <button data-command="devlog.showFlowDiagram">Flow</button>
            <button data-command="devlog.showClassDiagram">Class</button>
            <button data-command="devlog.showArchitectureMap">Architecture</button>
          </div>
          <h1>\${esc(data.title)}</h1>
          <p>\${esc(data.subtitle||'')}</p>
        </section>
        <section class="panel mermaid-wrap"><div class="mermaid">\${data.mermaid||'graph TD\\nA[No diagram]'}</div></section>
        <section class="panel"><h2>\${esc(data.bodyTitle||'Explanation')}</h2><ul>\${(data.body||[]).map(i=>'<li>'+esc(i)+'</li>').join('')}</ul></section>
        \${data.codeContext?'<section class="panel"><h2>Code Context</h2><pre>'+esc(data.codeContext)+'</pre></section>':''}
        <section class="panel"><h2>References</h2><ul class="references">\${(data.references||[]).map(r=>'<li><code>'+esc(r.filePath||'')+(r.line?':'+r.line:'')+'</code>'+(r.snippet?'<div>'+esc(r.snippet)+'</div>':'')+'</li>').join('')||'<li>No references.</li>'}</ul></section>
      </div>\`;
    document.querySelectorAll('button[data-command]').forEach(b=>b.addEventListener('click',()=>vscode.postMessage({command:b.dataset.command})));
    if(window.mermaid){mermaid.initialize({startOnLoad:true,securityLevel:'loose',theme:'neutral'});mermaid.run({querySelector:'.mermaid'})}
  </script>
</body>
</html>`
  }
}

function deactivate() {}

module.exports = { activate, deactivate }
