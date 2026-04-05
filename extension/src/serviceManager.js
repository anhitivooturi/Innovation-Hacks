const cp = require('child_process')
const fs = require('fs')
const path = require('path')

const {
  getBaseUrl,
  getProjectId,
  getPythonCommand,
  getWorkspaceRoot,
  isLocalBaseUrl,
  shouldAutoStartLocalServices,
} = require('./config')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function splitCommand(command) {
  const parts = command.match(/"[^"]+"|\S+/g) || []
  return parts.map(part => part.replace(/^"|"$/g, ''))
}

class LocalServiceManager {
  constructor(extensionUri, output) {
    this.extensionUri = extensionUri
    this.output = output
    this._apiProcess = null
    this._watcherProcess = null
    this._started = false
  }

  async start() {
    if (this._started) return
    this._started = true

    const workspaceRoot = getWorkspaceRoot()
    if (!workspaceRoot) {
      this.output.appendLine('[services] No workspace open; skipping local service auto-start.')
      return
    }

    const baseUrl = getBaseUrl()
    if (!shouldAutoStartLocalServices()) {
      this.output.appendLine('[services] Local service auto-start is disabled.')
      return
    }
    if (!isLocalBaseUrl(baseUrl)) {
      this.output.appendLine(`[services] Base URL is not local (${baseUrl}); skipping local service auto-start.`)
      return
    }

    const repoRoot = path.dirname(this.extensionUri.fsPath)
    const apiEntry = path.join(repoRoot, 'api', 'main.py')
    const watcherEntry = path.join(repoRoot, 'watcher', 'watcher.py')
    if (!fs.existsSync(apiEntry) || !fs.existsSync(watcherEntry)) {
      this.output.appendLine('[services] api/main.py or watcher/watcher.py is missing; cannot auto-start services.')
      return
    }

    const python = splitCommand(getPythonCommand())
    const executable = python[0]
    const leadingArgs = python.slice(1)

    const preflight = this._runPreflight(executable, leadingArgs, repoRoot)
    if (!preflight.ok) {
      this.output.appendLine('[services] Python preflight failed.')
      this.output.appendLine(preflight.message)
      this.output.appendLine('[services] Install dependencies with `py -3.13 -m pip install -r api/requirements.txt -r agent/requirements.txt`.')
      return
    }

    const existingHealth = await this._fetchHealth(baseUrl)
    if (existingHealth?.status === 'ok') {
      if (existingHealth.canonical_stack !== 'api+watcher') {
        this.output.appendLine('[services] Port 8000 is already serving a different backend. Stop it before using DevLog auto-start.')
        return
      }
      this.output.appendLine('[services] Reusing existing local DevLog API.')
      this._logHealth(existingHealth)
    } else {
      this.output.appendLine('[services] Starting local DevLog API...')
      this._apiProcess = this._spawn(
        'api',
        executable,
        [
          ...leadingArgs,
          '-m',
          'uvicorn',
          'api.main:app',
          '--host',
          new URL(baseUrl).hostname,
          '--port',
          new URL(baseUrl).port || '8000',
        ],
        {
          cwd: repoRoot,
          env: {
            ...process.env,
            DEVLOG_PROJECT_ROOT: workspaceRoot,
            PYTHONIOENCODING: 'utf-8',
          },
        },
      )

      const healthy = await this._waitForHealth(baseUrl, 30000)
      if (!healthy) {
        this.output.appendLine('[services] Local DevLog API failed to become healthy.')
        return
      }
      this._logHealth(healthy)
    }

    if (!this._watcherProcess) {
      this.output.appendLine('[services] Starting local DevLog watcher...')
      this._watcherProcess = this._spawn(
        'watcher',
        executable,
        [...leadingArgs, watcherEntry],
        {
          cwd: repoRoot,
          env: {
            ...process.env,
            DEVLOG_WATCH_PATH: workspaceRoot,
            DEVLOG_API_URL: `${baseUrl.replace(/\/$/, '')}/change`,
            DEVLOG_PROJECT_ID: getProjectId(),
            PYTHONIOENCODING: 'utf-8',
          },
        },
      )
    }
  }

  async stop() {
    await this._kill(this._watcherProcess, 'watcher')
    this._watcherProcess = null
    await this._kill(this._apiProcess, 'api')
    this._apiProcess = null
    this._started = false
  }

  _runPreflight(executable, args, cwd) {
    const result = cp.spawnSync(
      executable,
      [
        ...args,
        '-c',
        'import fastapi,uvicorn,watchdog,requests; import google.genai; import firebase_admin; print("ok")',
      ],
      {
        cwd,
        encoding: 'utf-8',
      },
    )
    if (result.status === 0) {
      return { ok: true, message: 'ok' }
    }
    const stderr = (result.stderr || '').trim()
    const stdout = (result.stdout || '').trim()
    return { ok: false, message: stderr || stdout || 'Unknown preflight failure.' }
  }

  _spawn(label, command, args, options) {
    const child = cp.spawn(command, args, {
      ...options,
      windowsHide: true,
    })

    child.stdout.on('data', chunk => this._logLines(label, chunk))
    child.stderr.on('data', chunk => this._logLines(label, chunk))
    child.on('exit', code => {
      this.output.appendLine(`[${label}] exited with code ${code}`)
      if (label === 'api') this._apiProcess = null
      if (label === 'watcher') this._watcherProcess = null
    })
    child.on('error', err => {
      this.output.appendLine(`[${label}] failed to start: ${err.message}`)
    })
    return child
  }

  _logLines(label, chunk) {
    const lines = String(chunk).split(/\r?\n/).filter(Boolean)
    for (const line of lines) {
      this.output.appendLine(`[${label}] ${line}`)
    }
  }

  async _fetchHealth(baseUrl) {
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/health`)
      if (!response.ok) return null
      return response.json()
    } catch {
      return null
    }
  }

  async _waitForHealth(baseUrl, timeoutMs) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const health = await this._fetchHealth(baseUrl)
      if (health?.status === 'ok') return health
      await sleep(1000)
    }
    return null
  }

  _logHealth(health) {
    this.output.appendLine(
      `[services] Health: firestore=${Boolean(health.firestore_available)} vertex=${Boolean(health.vertex_available)} project=${health.project || 'unknown'}`
    )
    if (!health.firestore_available && health.firestore_error) {
      this.output.appendLine(`[services] Firestore warning: ${health.firestore_error}`)
    }
    if (!health.vertex_available && health.vertex_error) {
      this.output.appendLine(`[services] Vertex warning: ${health.vertex_error}`)
    }
  }

  async _kill(child, label) {
    if (!child || child.killed) return
    child.kill()
    await sleep(500)
    if (!child.killed) {
      this.output.appendLine(`[services] Could not confirm ${label} shutdown; it may still be running.`)
    }
  }
}

module.exports = { LocalServiceManager }
