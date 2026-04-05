const vscode = require('vscode')

// Sidebar tree that color-codes files based on status.json / devlog state
class FileTreeProvider {
  constructor(statusProvider) {
    this._status = statusProvider
    this._onDidChangeTreeData = new vscode.EventEmitter()
    this.onDidChangeTreeData = this._onDidChangeTreeData.event
  }

  refresh() {
    this._onDidChangeTreeData.fire()
  }

  async getChildren(element) {
    if (element) return []

    const folders = vscode.workspace.workspaceFolders
    if (!folders) return []

    const uris = await vscode.workspace.findFiles(
      '**/*',
      '{**/node_modules/**,**/.git/**,**/dist/**,**/__pycache__/**,**/.venv/**,**/.venv313/**,**/devlog/**,**/.tmp_extension_branch/**}',
      150,
    )

    return uris
      .map(uri => {
        const rel = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/')
        const fileStatus = this._status.getFileStatus(rel)
        return this._makeItem(rel, fileStatus)
      })
      .sort((a, b) => {
        // Danger zones first
        const order = { danger: 0, incomplete: 1, working: 2 }
        return (order[a._statusKey] ?? 3) - (order[b._statusKey] ?? 3)
      })
  }

  getTreeItem(element) {
    return element
  }

  _makeItem(filePath, fileStatus) {
    const item = new vscode.TreeItem(filePath, vscode.TreeItemCollapsibleState.None)
    item.resourceUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, filePath)
    item._statusKey = fileStatus?.status || 'unknown'

    if (fileStatus?.status === 'danger') {
      item.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('list.errorForeground'))
      item.description = '🔴 danger'
      item.tooltip = fileStatus.reason || 'Danger zone flagged'
    } else if (fileStatus?.status === 'incomplete') {
      item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'))
      item.description = '🟡 incomplete'
      item.tooltip = fileStatus.reason || 'Incomplete or referenced but missing'
    } else if (fileStatus?.status === 'working') {
      item.iconPath = new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'))
      item.description = `🟢 ${fileStatus.classification || 'working'}`
      item.tooltip = fileStatus.reason || 'Recently changed, working'
    } else {
      item.iconPath = new vscode.ThemeIcon('file')
    }

    item.command = {
      command: 'vscode.open',
      title: 'Open File',
      arguments: [vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, filePath)],
    }

    return item
  }
}

module.exports = { FileTreeProvider }
