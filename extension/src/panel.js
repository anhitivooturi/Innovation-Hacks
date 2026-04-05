const vscode = require('vscode')

class DevLogPanel {
  constructor(extensionUri) {
    this.extensionUri = extensionUri
    this._panel = undefined
  }

  open() {
    if (this._panel) {
      this._panel.reveal(vscode.ViewColumn.One)
      return
    }
    this._panel = vscode.window.createWebviewPanel(
      'devlogMain',
      'DevLog — Project Explorer',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    )
    this._panel.onDidDispose(() => { this._panel = undefined })
    this._panel.webview.onDidReceiveMessage(msg => this._onMessage(msg))
    this._panel.webview.html = buildHomeHtml()
  }

  async _onMessage(msg) {
    switch (msg.type) {
      case 'generateDiagram':
        await this._generate('/diagram', { kind: msg.kind, projectId: getProjectId(), filePath: getActiveFile() }, msg.kind + ' diagram')
        break
      case 'explainFiles':
        await this._generate('/architecture/map', { projectId: getProjectId() }, 'files breakdown')
        break
      case 'explainFile':
        await this._generate('/explain/file', { projectId: getProjectId(), filePath: msg.filePath }, 'file explanation')
        break
      case 'query':
        await this._query(msg.text)
        break
    }
  }

  async _generate(endpoint, body, label) {
    this._send({ type: 'loading', label })
    try {
      const data = await postJson(endpoint, body)
      this._send({ type: 'result', label, data })
    } catch (err) {
      this._send({ type: 'error', label, message: err.message })
    }
  }

  async _query(text) {
    this._send({ type: 'loading', label: 'answer' })
    try {
      const data = await postJson('/query', { projectId: getProjectId(), query: text })
      this._send({ type: 'queryResult', answer: data.answer || data.response || JSON.stringify(data) })
    } catch (err) {
      this._send({ type: 'error', label: 'answer', message: err.message })
    }
  }

  _send(msg) {
    this._panel?.webview.postMessage(msg)
  }
}

function getProjectId() {
  return vscode.workspace.getConfiguration('devlog').get('projectId', 'default')
}

function getActiveFile() {
  const editor = vscode.window.activeTextEditor
  if (!editor) return undefined
  return vscode.workspace.asRelativePath(editor.document.uri, false).replace(/\\/g, '/')
}

async function postJson(path, body) {
  const baseUrl = vscode.workspace.getConfiguration('devlog').get('apiBaseUrl', 'http://127.0.0.1:8000')
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

function buildHomeHtml() {
  const nonce = String(Date.now())
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;">
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:var(--vscode-font-family);background:var(--vscode-editor-background);color:var(--vscode-foreground);padding:24px;display:grid;gap:24px}
    h1{font-size:20px;font-weight:600;margin-bottom:4px}
    h2{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground);margin-bottom:12px}
    .card{border:1px solid var(--vscode-panel-border);border-radius:12px;padding:18px}
    .diagram-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
    .diagram-btn{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:1px solid var(--vscode-panel-border);border-radius:8px;padding:12px 8px;cursor:pointer;font-size:12px;text-align:center;transition:background .15s}
    .diagram-btn:hover{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
    .diagram-btn .icon{font-size:22px;display:block;margin-bottom:6px}
    .primary-btn{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:8px;padding:10px 18px;cursor:pointer;font-size:13px}
    .primary-btn:hover{opacity:.9}
    #output{display:none}
    #output.visible{display:block}
    .output-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
    .back-btn{background:none;border:none;color:var(--vscode-textLink-foreground);cursor:pointer;font-size:12px}
    .mermaid-wrap{overflow:auto;background:var(--vscode-editor-background);border-radius:8px;padding:12px}
    .explanation{white-space:pre-wrap;font-size:13px;line-height:1.6}
    .file-list{display:grid;gap:8px}
    .file-item{border:1px solid var(--vscode-panel-border);border-radius:8px;padding:10px 14px;cursor:pointer}
    .file-item:hover{background:var(--vscode-list-hoverBackground)}
    .file-path{font-family:var(--vscode-editor-font-family);font-size:12px;color:var(--vscode-textLink-foreground)}
    .file-desc{font-size:12px;color:var(--vscode-descriptionForeground);margin-top:3px}
    .spinner{display:inline-block;width:16px;height:16px;border:2px solid var(--vscode-panel-border);border-top-color:var(--vscode-button-background);border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:8px}
    @keyframes spin{to{transform:rotate(360deg)}}
    .loading-msg{color:var(--vscode-descriptionForeground);font-size:13px;padding:24px 0}
    .error-msg{color:var(--vscode-list-errorForeground);font-size:13px;padding:12px}
    .query-row{display:flex;gap:8px}
    .query-input{flex:1;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:8px;padding:8px 12px;font-size:13px}
    .query-input::placeholder{color:var(--vscode-input-placeholderForeground)}
    .answer-box{margin-top:12px;padding:12px;background:var(--vscode-textBlockQuote-background);border-left:3px solid var(--vscode-button-background);border-radius:4px;font-size:13px;line-height:1.6;white-space:pre-wrap;display:none}
    .tag{display:inline-block;font-size:10px;padding:2px 7px;border-radius:10px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);margin-left:8px}
    .tts-bar{display:none;align-items:center;gap:8px;margin-top:14px;padding:10px 14px;background:var(--vscode-textBlockQuote-background);border-radius:8px;border:1px solid var(--vscode-panel-border)}
    .tts-bar.visible{display:flex}
    .tts-btn{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:6px;padding:5px 12px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:5px}
    .tts-btn.stop{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
    .tts-label{font-size:11px;color:var(--vscode-descriptionForeground);flex:1}
    .tts-speed{background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:4px;padding:3px 6px;font-size:11px;width:70px}
  </style>
</head>
<body>
  <!-- HOME VIEW -->
  <div id="home">
    <div>
      <h1>DevLog Project Explorer</h1>
      <p style="color:var(--vscode-descriptionForeground);font-size:13px;margin-top:4px">Understand any codebase — diagrams, file breakdowns, and natural language answers.</p>
    </div>

    <!-- Diagrams -->
    <div class="card">
      <h2>Diagrams</h2>
      <div class="diagram-grid">
        <button class="diagram-btn" data-kind="architecture">
          <span class="icon">🏗️</span>Architecture
        </button>
        <button class="diagram-btn" data-kind="dependency">
          <span class="icon">🔗</span>Dependencies
        </button>
        <button class="diagram-btn" data-kind="flow">
          <span class="icon">🔀</span>Flow Chart
        </button>
        <button class="diagram-btn" data-kind="class">
          <span class="icon">🧱</span>Class / UML
        </button>
        <button class="diagram-btn" data-kind="sequence">
          <span class="icon">📨</span>Sequence
        </button>
        <button class="diagram-btn" data-kind="database">
          <span class="icon">🗄️</span>Database / ERD
        </button>
        <button class="diagram-btn" data-kind="api">
          <span class="icon">🌐</span>API Routes
        </button>
        <button class="diagram-btn" data-kind="component">
          <span class="icon">🧩</span>Components
        </button>
      </div>
    </div>

    <!-- Files breakdown -->
    <div class="card">
      <h2>Files Breakdown</h2>
      <p style="font-size:13px;color:var(--vscode-descriptionForeground);margin-bottom:14px">Get a plain-English explanation of every file and folder in this project.</p>
      <button class="primary-btn" id="explain-files-btn">Explain All Files</button>
    </div>

    <!-- Ask anything -->
    <div class="card">
      <h2>Ask Anything</h2>
      <div class="query-row">
        <input class="query-input" id="query-input" placeholder="e.g. How does auth work? What does service.py do?" />
        <button class="primary-btn" id="ask-btn">Ask</button>
      </div>
      <div class="answer-box" id="answer-box"></div>
    </div>
  </div>

  <!-- OUTPUT VIEW -->
  <div id="output">
    <div class="output-header">
      <span id="output-title" style="font-size:15px;font-weight:600"></span>
      <button class="back-btn" id="back-btn">← Back</button>
    </div>
    <div id="output-body"></div>
    <!-- TTS bar appears after content loads -->
    <div class="tts-bar" id="tts-bar">
      <span class="tts-label">🔊 Read aloud</span>
      <select class="tts-speed" id="tts-speed" title="Speed">
        <option value="0.75">0.75×</option>
        <option value="1" selected>1×</option>
        <option value="1.25">1.25×</option>
        <option value="1.5">1.5×</option>
      </select>
      <button class="tts-btn" id="tts-play">▶ Play</button>
      <button class="tts-btn stop" id="tts-stop" style="display:none">■ Stop</button>
    </div>
  </div>

  <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi()
    mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'neutral' })

    // Diagram buttons
    document.querySelectorAll('.diagram-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        showLoading(btn.textContent.trim() + ' diagram')
        vscode.postMessage({ type: 'generateDiagram', kind: btn.dataset.kind })
      })
    })

    // Files breakdown
    document.getElementById('explain-files-btn').addEventListener('click', () => {
      showLoading('Files breakdown')
      vscode.postMessage({ type: 'explainFiles' })
    })

    // Ask
    document.getElementById('ask-btn').addEventListener('click', sendQuery)
    document.getElementById('query-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendQuery() })
    function sendQuery() {
      const text = document.getElementById('query-input').value.trim()
      if (!text) return
      document.getElementById('answer-box').style.display = 'block'
      document.getElementById('answer-box').textContent = '⏳ Thinking…'
      vscode.postMessage({ type: 'query', text })
    }

    // Back button — handled in TTS section above

    function showLoading(label) {
      document.getElementById('home').style.display = 'none'
      document.getElementById('output').style.display = 'block'
      document.getElementById('output-title').textContent = label
      document.getElementById('output-body').innerHTML = '<div class="loading-msg"><span class="spinner"></span>Generating ' + esc(label) + '…</div>'
    }

    // Messages from extension
    window.addEventListener('message', async e => {
      const msg = e.data
      if (msg.type === 'loading') {
        showLoading(msg.label)
      } else if (msg.type === 'error') {
        document.getElementById('output-body').innerHTML = '<div class="error-msg">⚠️ ' + esc(msg.message) + '<br><small>Make sure the DevLog backend is running.</small></div>'
      } else if (msg.type === 'queryResult') {
        const box = document.getElementById('answer-box')
        box.style.display = 'block'
        box.textContent = msg.answer
        // TTS for answer — show a small read button inline
        const existing = document.getElementById('answer-tts')
        if (existing) existing.remove()
        const btn = document.createElement('button')
        btn.id = 'answer-tts'
        btn.className = 'tts-btn'
        btn.style.cssText = 'margin-top:8px;font-size:11px'
        btn.textContent = '🔊 Read answer'
        btn.addEventListener('click', () => {
          speechSynthesis.cancel()
          const utt = new SpeechSynthesisUtterance(msg.answer)
          utt.rate = 1
          speechSynthesis.speak(utt)
        })
        box.after(btn)
      } else if (msg.type === 'result') {
        renderResult(msg.label, msg.data)
      }
    })

    async function renderResult(label, data) {
      document.getElementById('output-title').textContent = label
      const body = document.getElementById('output-body')
      let speakText = ''

      // If there's a mermaid diagram
      if (data.mermaid) {
        const id = 'mermaid-' + Date.now()
        body.innerHTML = \`
          <div class="mermaid-wrap">
            <div id="\${id}" class="mermaid">\${esc(data.mermaid)}</div>
          </div>
          \${data.summary || data.explanation ? '<p class="explanation" style="margin-top:16px">' + esc(data.summary || data.explanation || '') + '</p>' : ''}
          \${renderBullets(data.bullets || data.body || [])}
          \${renderRefs(data.references || data.entrypoints || [])}
        \`
        try {
          await mermaid.run({ querySelector: '#' + id })
        } catch(err) {
          document.getElementById(id).textContent = data.mermaid
        }
        speakText = [label, data.summary || data.explanation || '', ...(data.bullets || data.body || [])].filter(Boolean).join('. ')
        setTtsText(speakText)
        return
      }

      // Files breakdown — list of files with descriptions
      if (data.files || data.fileTree) {
        const files = data.files || data.fileTree || []
        body.innerHTML = \`
          <div class="file-list">
            \${files.map(f => \`
              <div class="file-item" data-path="\${esc(f.path || f.filePath || f)}">
                <div class="file-path">\${esc(f.path || f.filePath || f)}</div>
                \${f.description || f.summary ? '<div class="file-desc">' + esc(f.description || f.summary) + '</div>' : ''}
              </div>
            \`).join('')}
          </div>
        \`
        body.querySelectorAll('.file-item').forEach(item => {
          item.addEventListener('click', () => {
            showLoading('Explaining ' + item.dataset.path)
            vscode.postMessage({ type: 'explainFile', filePath: item.dataset.path })
          })
        })
        speakText = files.map(f => {
          const name = f.path || f.filePath || f
          const desc = f.description || f.summary || ''
          return desc ? \`\${name}: \${desc}\` : name
        }).join('. ')
        setTtsText(speakText)
        return
      }

      // Generic text result
      body.innerHTML = \`
        \${data.title ? '<h2 style="margin-bottom:8px">' + esc(data.title) + '</h2>' : ''}
        \${data.summary || data.explanation ? '<p class="explanation">' + esc(data.summary || data.explanation) + '</p>' : ''}
        \${renderBullets(data.bullets || data.body || [])}
        \${renderRefs(data.references || [])}
        <pre style="margin-top:12px;font-size:12px;white-space:pre-wrap">\${esc(JSON.stringify(data, null, 2))}</pre>
      \`
      speakText = [data.title, data.summary || data.explanation, ...(data.bullets || data.body || [])].filter(Boolean).join('. ')
      setTtsText(speakText)
    }

    // ── Text-to-Speech ────────────────────────────────────────────────
    let _ttsText = ''

    function setTtsText(text) {
      _ttsText = text
      speechSynthesis.cancel()
      document.getElementById('tts-bar').classList.toggle('visible', !!text.trim())
      document.getElementById('tts-play').style.display = 'inline-flex'
      document.getElementById('tts-stop').style.display = 'none'
    }

    document.getElementById('tts-play').addEventListener('click', () => {
      if (!_ttsText) return
      speechSynthesis.cancel()
      const utt = new SpeechSynthesisUtterance(_ttsText)
      utt.rate = parseFloat(document.getElementById('tts-speed').value)
      utt.onend = () => {
        document.getElementById('tts-play').style.display = 'inline-flex'
        document.getElementById('tts-stop').style.display = 'none'
      }
      speechSynthesis.speak(utt)
      document.getElementById('tts-play').style.display = 'none'
      document.getElementById('tts-stop').style.display = 'inline-flex'
    })

    document.getElementById('tts-stop').addEventListener('click', () => {
      speechSynthesis.cancel()
      document.getElementById('tts-play').style.display = 'inline-flex'
      document.getElementById('tts-stop').style.display = 'none'
    })

    // Stop speaking when navigating back
    document.getElementById('back-btn').addEventListener('click', () => {
      speechSynthesis.cancel()
      document.getElementById('home').style.display = 'grid'
      document.getElementById('output').style.display = 'none'
    })

    function renderBullets(items) {
      if (!items.length) return ''
      return '<ul style="margin-top:12px;padding-left:18px;font-size:13px;line-height:1.7">' + items.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>'
    }

    function renderRefs(refs) {
      if (!refs.length) return ''
      return '<div style="margin-top:12px;font-size:12px;color:var(--vscode-descriptionForeground)">' + refs.map(r => '<code>' + esc(typeof r === 'string' ? r : r.filePath || '') + '</code>').join(' · ') + '</div>'
    }

    function esc(v) {
      return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    }
  </script>
</body>
</html>`
}

module.exports = { DevLogPanel }
