const vscode = require('vscode')
const { DevLogPanel } = require('./panel')
const { ContextHarvester } = require('./contextHarvester')
const { FileTreeProvider } = require('./fileTreeProvider')
const { StatusProvider } = require('./statusProvider')
const { SidebarProvider } = require('./sidebarProvider')

function activate(context) {
  const output = vscode.window.createOutputChannel('DevLog AI')

  try {
    const panel = new DevLogPanel(context.extensionUri)
    const statusProvider = new StatusProvider(output)
    const fileTreeProvider = new FileTreeProvider(statusProvider)
    const sidebarProvider = new SidebarProvider(context.extensionUri, statusProvider, output)

    // Patch poll to refresh tree + sidebar
    const origPoll = statusProvider._poll.bind(statusProvider)
    statusProvider._poll = async function () {
      try { await origPoll(); fileTreeProvider.refresh(); sidebarProvider.refresh() }
      catch (err) { output.appendLine(`[poll] ${err.message}`) }
    }

    setTimeout(() => {
      statusProvider.start()
      new ContextHarvester(output).start()
    }, 1000)

    context.subscriptions.push(
      output,
      vscode.window.registerTreeDataProvider('devlogFileTree', fileTreeProvider),
      vscode.window.registerWebviewViewProvider('devlogSidebar', sidebarProvider),

      // Main command — opens the project explorer panel
      vscode.commands.registerCommand('devlog.openPanel', () => panel.open()),

      // Diagram shortcuts (open panel then trigger diagram)
      vscode.commands.registerCommand('devlog.showArchitectureMap',   () => { panel.open(); panel._panel?.webview.postMessage({ type: 'loading', label: 'architecture diagram' }); panel._generate('/diagram', { kind: 'architecture', projectId: getProjectId() }, 'architecture diagram') }),
      vscode.commands.registerCommand('devlog.showDependencyDiagram', () => { panel.open(); panel._generate('/diagram', { kind: 'dependency',   projectId: getProjectId() }, 'dependency diagram') }),
      vscode.commands.registerCommand('devlog.showFlowDiagram',       () => { panel.open(); panel._generate('/diagram', { kind: 'flow',         projectId: getProjectId() }, 'flow diagram') }),
      vscode.commands.registerCommand('devlog.showClassDiagram',      () => { panel.open(); panel._generate('/diagram', { kind: 'class',        projectId: getProjectId() }, 'class diagram') }),

      vscode.commands.registerCommand('devlog.explainCurrentFile', async () => {
        const editor = vscode.window.activeTextEditor
        if (!editor) { vscode.window.showWarningMessage('Open a file first.'); return }
        const filePath = vscode.workspace.asRelativePath(editor.document.uri, false).replace(/\\/g, '/')
        panel.open()
        panel._generate('/explain/file', { projectId: getProjectId(), filePath }, `Explaining ${filePath}`)
      }),

      vscode.commands.registerCommand('devlog.explainSelection', async () => {
        const editor = vscode.window.activeTextEditor
        if (!editor) { vscode.window.showWarningMessage('Open a file first.'); return }
        const filePath = vscode.workspace.asRelativePath(editor.document.uri, false).replace(/\\/g, '/')
        const payload = { projectId: getProjectId(), filePath }
        if (!editor.selection.isEmpty) {
          payload.selectionStartLine = editor.selection.start.line + 1
          payload.selectionEndLine = editor.selection.end.line + 1
        }
        panel.open()
        panel._generate('/explain/file', payload, `Explaining selection in ${filePath}`)
      }),

      vscode.commands.registerCommand('devlog.searchCode', async () => {
        const query = await vscode.window.showInputBox({ title: 'DevLog Search', placeHolder: 'Search for a symbol, method, or keyword' })
        if (!query) return
        panel.open()
        panel._generate('/search/code', { projectId: getProjectId(), query, limit: 8 }, `Search: ${query}`)
      }),

      vscode.commands.registerCommand('devlog.refreshFileTree', () => fileTreeProvider.refresh()),
      vscode.commands.registerCommand('devlog.refreshPanel', () => panel.open()),
    )
  } catch (err) {
    output.appendLine(`[DevLog activate error] ${err.message}\n${err.stack}`)
    output.show(true)
    throw err
  }
}

function getProjectId() {
  return vscode.workspace.getConfiguration('devlog').get('projectId', 'default')
}

function deactivate() {}
module.exports = { activate, deactivate }
