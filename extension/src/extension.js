const vscode = require('vscode')

const { getProjectId, getVoiceConfig } = require('./config')
const { ContextHarvester } = require('./contextHarvester')
const { FileTreeProvider } = require('./fileTreeProvider')
const { DevLogPanel } = require('./panel')
const { LocalServiceManager } = require('./serviceManager')
const { SidebarProvider } = require('./sidebarProvider')
const { StatusProvider } = require('./statusProvider')

let runtime = null

function registerCommands(context, panel, fileTreeProvider) {
  context.subscriptions.push(
    vscode.commands.registerCommand('devlog.openPanel', () => {
      panel.open()
      panel.setConfig(getVoiceConfig())
    }),

    vscode.commands.registerCommand('devlog.showArchitectureMap', () => {
      panel.open()
      panel.generate('/architecture/map', { projectId: getProjectId() }, 'Architecture map')
    }),

    vscode.commands.registerCommand('devlog.showDependencyDiagram', () => {
      panel.open()
      panel.generate('/diagram', { kind: 'dependency', projectId: getProjectId() }, 'Dependency diagram')
    }),

    vscode.commands.registerCommand('devlog.showFlowDiagram', () => {
      panel.open()
      panel.generate('/diagram', { kind: 'flow', projectId: getProjectId() }, 'Flow diagram')
    }),

    vscode.commands.registerCommand('devlog.showClassDiagram', () => {
      panel.open()
      panel.generate('/diagram', { kind: 'class', projectId: getProjectId() }, 'Class diagram')
    }),

    vscode.commands.registerCommand('devlog.explainCurrentFile', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        vscode.window.showWarningMessage('Open a file first.')
        return
      }
      const filePath = vscode.workspace.asRelativePath(editor.document.uri, false).replace(/\\/g, '/')
      panel.open()
      panel.generate('/explain/file', { projectId: getProjectId(), filePath }, `Explain ${filePath}`)
    }),

    vscode.commands.registerCommand('devlog.explainSelection', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        vscode.window.showWarningMessage('Open a file first.')
        return
      }
      const filePath = vscode.workspace.asRelativePath(editor.document.uri, false).replace(/\\/g, '/')
      const payload = { projectId: getProjectId(), filePath }
      if (!editor.selection.isEmpty) {
        payload.selectionStartLine = editor.selection.start.line + 1
        payload.selectionEndLine = editor.selection.end.line + 1
      }
      panel.open()
      panel.generate('/explain/file', payload, `Explain ${filePath}`)
    }),

    vscode.commands.registerCommand('devlog.searchCode', async () => {
      const query = await vscode.window.showInputBox({
        title: 'DevLog Search',
        placeHolder: 'Search for a symbol, file, or keyword',
      })
      if (!query) return
      panel.open()
      panel.generate('/search/code', { projectId: getProjectId(), query, limit: 8 }, `Search: ${query}`)
    }),

    vscode.commands.registerCommand('devlog.refreshFileTree', () => fileTreeProvider.refresh()),
    vscode.commands.registerCommand('devlog.refreshPanel', () => panel.open()),
  )
}

function activate(context) {
  const output = vscode.window.createOutputChannel('DevLog AI')
  const panel = new DevLogPanel(context.extensionUri)
  const serviceManager = new LocalServiceManager(context.extensionUri, output)
  const statusProvider = new StatusProvider(output)
  const fileTreeProvider = new FileTreeProvider(statusProvider)
  const sidebarProvider = new SidebarProvider(context.extensionUri, statusProvider, output)
  const contextHarvester = new ContextHarvester(output)

  runtime = { serviceManager, statusProvider, contextHarvester }

  context.subscriptions.push(
    output,
    vscode.window.registerTreeDataProvider('devlogFileTree', fileTreeProvider),
    vscode.window.registerWebviewViewProvider('devlogSidebar', sidebarProvider),
    {
      dispose: () => {
        sidebarProvider.dispose()
        contextHarvester.stop()
        statusProvider.stop()
        void serviceManager.stop()
      },
    },
  )

  registerCommands(context, panel, fileTreeProvider)

  const refreshConsumers = async () => {
    await statusProvider.pollNow()
    fileTreeProvider.refresh()
    sidebarProvider.refresh()
  }

  void serviceManager.start().finally(async () => {
    statusProvider.start()
    contextHarvester.start()
    await refreshConsumers()
  })
}

async function deactivate() {
  if (!runtime) return
  runtime.contextHarvester.stop()
  runtime.statusProvider.stop()
  await runtime.serviceManager.stop()
  runtime = null
}

module.exports = { activate, deactivate }
