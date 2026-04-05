const vscode = require('vscode')

function getConfiguration() {
  return vscode.workspace.getConfiguration('devlog')
}

function getBaseUrl() {
  return getConfiguration().get('apiBaseUrl', 'http://127.0.0.1:8000')
}

function getProjectId() {
  return getConfiguration().get('projectId', 'default')
}

function getPythonCommand() {
  return getConfiguration().get('pythonCommand', 'py -3.13')
}

function shouldAutoStartLocalServices() {
  return getConfiguration().get('autoStartLocalServices', true)
}

function shouldShowStatusBar() {
  return getConfiguration().get('showStatusBar', true)
}

function getVoiceConfig() {
  return {
    elevenLabsApiKey: getConfiguration().get('elevenLabsApiKey', ''),
    elevenLabsVoiceId: getConfiguration().get('elevenLabsVoiceId', '21m00Tcm4TlvDq8ikWAM'),
  }
}

function getWorkspaceRoot() {
  const folder = vscode.workspace.workspaceFolders?.[0]
  return folder ? folder.uri.fsPath : null
}

function isLocalBaseUrl(baseUrl = getBaseUrl()) {
  try {
    const url = new URL(baseUrl)
    return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
  } catch {
    return false
  }
}

module.exports = {
  getBaseUrl,
  getConfiguration,
  getProjectId,
  getPythonCommand,
  getVoiceConfig,
  getWorkspaceRoot,
  isLocalBaseUrl,
  shouldAutoStartLocalServices,
  shouldShowStatusBar,
}
