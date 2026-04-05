const vscode = require('vscode')

function activate(context) {
  const panel = new DevLogPanel(context.extensionUri)
  const treeProvider = new DevLogTreeProvider()
  const output = vscode.window.createOutputChannel('DevLog AI')
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  statusBar.text = '$(graph) DevLog'
  statusBar.command = 'devlog.openPanel'
  statusBar.tooltip = 'Open DevLog Project Copilot'

  context.subscriptions.push(
    output,
    vscode.window.registerTreeDataProvider('devlogExplorer', treeProvider),
    statusBar,
    vscode.commands.registerCommand('devlog.openPanel', () => panel.showWelcome()),
    vscode.commands.registerCommand('devlog.explainCurrentFile', async () => {
      const payload = await buildFilePayload()
      if (!payload) {
        return
      }

      output.appendLine(`Explaining file: ${payload.filePath}`)
      const response = await postJson('/explain/file', payload, output)
      panel.showExplanation(response, payload.filePath)
    }),
    vscode.commands.registerCommand('devlog.explainSelection', async () => {
      const payload = await buildFilePayload(true)
      if (!payload) {
        return
      }

      output.appendLine(`Explaining selection in: ${payload.filePath}`)
      const response = await postJson('/explain/file', payload, output)
      panel.showExplanation(response, payload.filePath)
    }),
    vscode.commands.registerCommand('devlog.showDependencyDiagram', async () => {
      const payload = await buildDiagramPayload('dependency')
      if (!payload) {
        return
      }

      output.appendLine(`Generating dependency diagram for: ${payload.filePath || 'workspace'}`)
      const response = await postJson('/diagram', payload, output)
      panel.showDiagram(response)
    }),
    vscode.commands.registerCommand('devlog.showFlowDiagram', async () => {
      const payload = await buildDiagramPayload('flow')
      if (!payload) {
        return
      }

      output.appendLine(`Generating flow diagram for: ${payload.filePath || 'workspace'}`)
      const response = await postJson('/diagram', payload, output)
      panel.showDiagram(response)
    }),
    vscode.commands.registerCommand('devlog.showClassDiagram', async () => {
      const payload = await buildDiagramPayload('class')
      if (!payload) {
        return
      }

      output.appendLine(`Generating class diagram for: ${payload.filePath || 'workspace'}`)
      const response = await postJson('/diagram', payload, output)
      panel.showDiagram(response)
    }),
    vscode.commands.registerCommand('devlog.showArchitectureMap', async () => {
      output.appendLine('Generating workspace architecture map')
      const response = await postJson('/architecture/map', { projectId: getProjectId() }, output)
      panel.showArchitecture(response)
    }),
    vscode.commands.registerCommand('devlog.searchCode', async () => {
      const query = await vscode.window.showInputBox({
        title: 'DevLog Search Code',
        placeHolder: 'Search for a symbol, method, route, or keyword',
      })
      if (!query) {
        return
      }

      output.appendLine(`Searching code for: ${query}`)
      const response = await postJson('/search/code', { projectId: getProjectId(), query, limit: 8 }, output)
      panel.showSearch(query, response.matches || [])
    }),
    vscode.commands.registerCommand('devlog.refreshPanel', async () => {
      output.appendLine('Refreshing DevLog panel with workspace architecture map')
      const response = await postJson('/architecture/map', { projectId: getProjectId() }, output)
      panel.showArchitecture(response)
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      treeProvider.setActiveFile(editor ? relativeWorkspacePath(editor.document.uri) : null)
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('devlog.showStatusBar')) {
        updateStatusBarVisibility(statusBar)
      }
    }),
  )

  treeProvider.setActiveFile(vscode.window.activeTextEditor ? relativeWorkspacePath(vscode.window.activeTextEditor.document.uri) : null)
  updateStatusBarVisibility(statusBar)
}

class DevLogTreeProvider {
  constructor() {
    this.activeFile = null
    this._onDidChangeTreeData = new vscode.EventEmitter()
    this.onDidChangeTreeData = this._onDidChangeTreeData.event
  }

  setActiveFile(filePath) {
    this.activeFile = filePath
    this._onDidChangeTreeData.fire()
  }

  getChildren(element) {
    if (element) {
      return []
    }

    const items = [
      this._infoItem(`Active File: ${this.activeFile || 'No editor open'}`),
      this._item('Explain Current File', 'devlog.explainCurrentFile'),
      this._item('Explain Selection', 'devlog.explainSelection'),
      this._item('Dependency Diagram', 'devlog.showDependencyDiagram'),
      this._item('Flow Diagram', 'devlog.showFlowDiagram'),
      this._item('Class Diagram', 'devlog.showClassDiagram'),
      this._item('Architecture Map', 'devlog.showArchitectureMap'),
      this._item('Search Code', 'devlog.searchCode'),
      this._item('Refresh Panel', 'devlog.refreshPanel'),
      this._item('Open Panel', 'devlog.openPanel'),
    ]
    return items
  }

  _item(label, command) {
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None)
    item.command = { command, title: label }
    return item
  }

  _infoItem(label) {
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None)
    item.contextValue = 'devlogInfo'
    return item
  }
}

class DevLogPanel {
  constructor(extensionUri) {
    this.extensionUri = extensionUri
    this.panel = undefined
  }

  showWelcome() {
    const content = {
      title: 'DevLog Project Copilot',
      subtitle: 'Use the commands in the sidebar or command palette to explain files and render diagrams.',
      mermaid: 'graph TD\n    A[Open a file] --> B[Run a DevLog command]\n    B --> C[See text + diagram here]',
      references: [],
      bodyTitle: 'What this panel does',
      body: [
        'Explains the current file or selected lines.',
        'Generates Mermaid diagrams for dependencies, flow, classes, and architecture.',
        'Uses the DevLog backend, which can later switch from local heuristics to Vertex AI.'
      ]
    }
    this._render(content)
  }

  showExplanation(response, filePath) {
    this._render({
      title: response.title,
      subtitle: response.summary,
      mermaid: response.mermaid,
      references: response.references || [],
      bodyTitle: filePath,
      body: response.bullets || [],
      codeContext: response.codeContext || ''
    })
  }

  showDiagram(response) {
    this._render({
      title: response.title,
      subtitle: response.explanation,
      mermaid: response.mermaid,
      references: response.references || [],
      bodyTitle: `${response.kind} diagram`,
      body: ['Diagram generated from the current workspace and file context.']
    })
  }

  showArchitecture(response) {
    this._render({
      title: response.title,
      subtitle: response.summary,
      mermaid: response.mermaid,
      references: [
        ...(response.entrypoints || []).map((filePath) => ({ filePath, line: null, snippet: 'entrypoint' })),
        ...(response.hotspots || []).map((filePath) => ({ filePath, line: null, snippet: 'hotspot' }))
      ],
      bodyTitle: 'Workspace signals',
      body: [
        `Entrypoints: ${(response.entrypoints || []).join(', ') || 'none detected'}`,
        `Hotspots: ${(response.hotspots || []).join(', ') || 'none detected'}`
      ]
    })
  }

  showSearch(query, matches) {
    this._render({
      title: `Search results for "${query}"`,
      subtitle: `Found ${matches.length} matching files or lines.`,
      mermaid: 'graph TD\n    Query[Search query] --> Results[Relevant files and symbols]',
      references: matches,
      bodyTitle: 'Matches',
      body: matches.map((match) => `${match.filePath}${match.line ? `:${match.line}` : ''}`),
    })
  }

  _ensurePanel() {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside)
      return this.panel
    }

    this.panel = vscode.window.createWebviewPanel(
      'devlogPanel',
      'DevLog Project Copilot',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
      },
    )

    this.panel.onDidDispose(() => {
      this.panel = undefined
    })

    this.panel.webview.onDidReceiveMessage(async (message) => {
      if (message.command) {
        await vscode.commands.executeCommand(message.command)
      }
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
          <meta charset="UTF-8" />
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${panel.webview.cspSource} https:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; connect-src https:;">
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${escapeHtml(content.title)}</title>
        </head>
        <body style="font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 18px;">
          <div id="root"></div>
          <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
          <script nonce="${nonce}">
            const vscode = acquireVsCodeApi();
            const data = ${escaped};
            const root = document.getElementById('root');

            function render() {
              root.innerHTML = \`
                <style>
                  .shell { display: grid; gap: 16px; }
                  .hero { border: 1px solid var(--vscode-panel-border); border-radius: 16px; padding: 16px; }
                  .row { display: flex; flex-wrap: wrap; gap: 8px; }
                  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 8px; padding: 8px 12px; cursor: pointer; }
                  .panel { border: 1px solid var(--vscode-panel-border); border-radius: 14px; padding: 14px; }
                  .mermaid-wrap { overflow: auto; }
                  pre { white-space: pre-wrap; font-family: var(--vscode-editor-font-family); }
                  ul { padding-left: 18px; }
                  .references li { margin-bottom: 8px; }
                  code { font-family: var(--vscode-editor-font-family); }
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
                    <h1>\${escape(data.title)}</h1>
                    <p>\${escape(data.subtitle || '')}</p>
                  </section>
                  <section class="panel mermaid-wrap">
                    <div class="mermaid">\${data.mermaid || 'graph TD\\nA[No diagram returned yet]'}</div>
                  </section>
                  <section class="panel">
                    <h2>\${escape(data.bodyTitle || 'Explanation')}</h2>
                    <ul>\${(data.body || []).map((item) => '<li>' + escape(item) + '</li>').join('')}</ul>
                  </section>
                  \${data.codeContext ? '<section class="panel"><h2>Code Context</h2><pre>' + escape(data.codeContext) + '</pre></section>' : ''}
                  <section class="panel">
                    <h2>References</h2>
                    <ul class="references">
                      \${(data.references || []).map((ref) => '<li><code>' + escape(ref.filePath || '') + (ref.line ? ':' + ref.line : '') + '</code>' + (ref.snippet ? '<div>' + escape(ref.snippet) + '</div>' : '') + '</li>').join('') || '<li>No references returned.</li>'}
                    </ul>
                  </section>
                </div>
              \`

              document.querySelectorAll('button[data-command]').forEach((button) => {
                button.addEventListener('click', () => {
                  vscode.postMessage({ command: button.dataset.command });
                });
              });

              if (window.mermaid) {
                window.mermaid.initialize({ startOnLoad: true, securityLevel: 'loose', theme: 'neutral' });
                window.mermaid.run({ querySelector: '.mermaid' });
              }
            }

            function escape(value) {
              return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
            }

            render();
          </script>
        </body>
      </html>`
  }
}

async function buildFilePayload(useSelection = false) {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    vscode.window.showWarningMessage('Open a file first.')
    return null
  }

  const filePath = relativeWorkspacePath(editor.document.uri)
  const payload = {
    projectId: getProjectId(),
    filePath,
  }

  if (useSelection && !editor.selection.isEmpty) {
    payload.selectionStartLine = editor.selection.start.line + 1
    payload.selectionEndLine = editor.selection.end.line + 1
  }

  return payload
}

async function buildDiagramPayload(kind) {
  const editor = vscode.window.activeTextEditor
  return {
    projectId: getProjectId(),
    kind,
    filePath: editor ? relativeWorkspacePath(editor.document.uri) : undefined,
  }
}

function relativeWorkspacePath(uri) {
  return vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/')
}

async function postJson(path, body, output) {
  const baseUrl = vscode.workspace.getConfiguration('devlog').get('apiBaseUrl', 'http://127.0.0.1:8000')
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const message = await response.text()
    if (output) {
      output.appendLine(`Request failed for ${path}: ${response.status} ${message}`)
      output.show(true)
    }
    vscode.window.showErrorMessage(`DevLog request failed: ${response.status} ${message}`)
    throw new Error(message)
  }

  return await response.json()
}

function getProjectId() {
  return vscode.workspace.getConfiguration('devlog').get('projectId', 'default')
}

function updateStatusBarVisibility(statusBar) {
  const showStatusBar = vscode.workspace.getConfiguration('devlog').get('showStatusBar', true)
  if (showStatusBar) {
    statusBar.show()
  } else {
    statusBar.hide()
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
}
