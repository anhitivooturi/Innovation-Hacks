const vscode = require('vscode')

const { getBaseUrl, getProjectId } = require('./config')

class DevLogPanel {
  constructor(extensionUri) {
    this.extensionUri = extensionUri
    this._panel = undefined
    this._ready = false
    this._config = {
      elevenLabsApiKey: '',
      elevenLabsVoiceId: '21m00Tcm4TlvDq8ikWAM',
    }
  }

  open() {
    if (this._panel) {
      this._panel.reveal(vscode.ViewColumn.One)
      this._flushConfig()
      return
    }

    this._ready = false
    this._panel = vscode.window.createWebviewPanel(
      'devlogMain',
      'DevLog Project Explorer',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    )
    this._panel.onDidDispose(() => {
      this._panel = undefined
      this._ready = false
    })
    this._panel.webview.onDidReceiveMessage(msg => void this._onMessage(msg))
    this._panel.webview.html = buildHomeHtml(this._panel.webview)
  }

  setConfig(config) {
    this._config = {
      ...this._config,
      ...config,
    }
    this._flushConfig()
  }

  async generate(endpoint, body, label) {
    this._send({ type: 'loading', label })
    try {
      const data = await postJson(endpoint, body)
      this._send({ type: 'result', label, data })
    } catch (err) {
      this._send({ type: 'error', label, message: err.message })
    }
  }

  async query(text) {
    const trimmed = String(text || '').trim()
    if (!trimmed) return
    this._send({ type: 'queryLoading' })
    try {
      const data = await postJson('/query', { projectId: getProjectId(), question: trimmed, query: trimmed })
      this._send({ type: 'queryResult', answer: data.answer || '' })
    } catch (err) {
      this._send({ type: 'queryError', message: err.message })
    }
  }

  async _onMessage(msg) {
    if (msg.type === 'ready') {
      this._ready = true
      this._flushConfig()
      return
    }
    if (msg.type === 'generateDiagram') {
      const label = `${msg.kind} diagram`
      await this.generate('/diagram', { kind: msg.kind, projectId: getProjectId(), filePath: getActiveFile() }, label)
      return
    }
    if (msg.type === 'architectureMap') {
      await this.generate('/architecture/map', { projectId: getProjectId() }, 'Architecture map')
      return
    }
    if (msg.type === 'explainFile') {
      await this.generate('/explain/file', { projectId: getProjectId(), filePath: msg.filePath }, `Explain ${msg.filePath}`)
      return
    }
    if (msg.type === 'searchCode') {
      await this.generate('/search/code', { projectId: getProjectId(), query: msg.query, limit: 8 }, `Search: ${msg.query}`)
      return
    }
    if (msg.type === 'query') {
      await this.query(msg.text)
    }
  }

  _flushConfig() {
    if (!this._panel || !this._ready) return
    this._send({ type: 'configure', ...this._config })
  }

  _send(message) {
    this._panel?.webview.postMessage(message)
  }
}

function getActiveFile() {
  const editor = vscode.window.activeTextEditor
  if (!editor) return undefined
  return vscode.workspace.asRelativePath(editor.document.uri, false).replace(/\\/g, '/')
}

async function postJson(path, body) {
  const response = await fetch(`${getBaseUrl().replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`)
  }
  return response.json()
}

function buildHomeHtml(webview) {
  const nonce = String(Date.now())
  const cspSource = webview.cspSource
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${cspSource} https: data:; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; connect-src ${cspSource} http://127.0.0.1:8000 http://localhost:8000 https://api.elevenlabs.io; media-src blob: https:;" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); display: grid; gap: 18px; }
    h1 { margin: 0; font-size: 22px; }
    h2 { margin: 0 0 10px; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--vscode-descriptionForeground); }
    p { margin: 0; line-height: 1.5; }
    .card { border: 1px solid var(--vscode-panel-border); border-radius: 12px; padding: 16px; display: grid; gap: 12px; }
    .grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); }
    button { border: 1px solid var(--vscode-panel-border); border-radius: 8px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); padding: 10px 12px; cursor: pointer; text-align: left; }
    button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }
    button:hover { filter: brightness(1.05); }
    .query-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
    input { width: 100%; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 8px; padding: 9px 12px; }
    #answer-box { display: none; white-space: pre-wrap; border-left: 3px solid var(--vscode-button-background); background: var(--vscode-textBlockQuote-background); border-radius: 6px; padding: 12px; line-height: 1.6; }
    #output { display: none; gap: 16px; }
    .output-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .mermaid-wrap { overflow: auto; border: 1px solid var(--vscode-panel-border); border-radius: 10px; padding: 12px; background: var(--vscode-editor-background); }
    .section { display: grid; gap: 10px; }
    .list { display: grid; gap: 8px; }
    .item { border: 1px solid var(--vscode-panel-border); border-radius: 10px; padding: 10px 12px; cursor: pointer; }
    .item:hover { background: var(--vscode-list-hoverBackground); }
    .file { color: var(--vscode-textLink-foreground); font-size: 12px; font-family: var(--vscode-editor-font-family); }
    .summary { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .refs { display: flex; flex-wrap: wrap; gap: 8px; }
    .refs code { font-size: 12px; }
    .controls { display: flex; gap: 8px; align-items: center; }
    .hidden { display: none !important; }
    .loading { color: var(--vscode-descriptionForeground); }
    ul { margin: 0; padding-left: 18px; line-height: 1.6; }
  </style>
</head>
<body>
  <div id="home" class="section">
    <div>
      <h1>DevLog Project Explorer</h1>
      <p class="muted">Grounded diagrams, file explanations, and project answers from the local Vertex + Firebase stack.</p>
    </div>

    <div class="card">
      <h2>Diagrams</h2>
      <div class="grid">
        <button data-action="architecture" class="primary">Architecture map</button>
        <button data-kind="dependency">Dependency diagram</button>
        <button data-kind="flow">Flow diagram</button>
        <button data-kind="class">Class diagram</button>
        <button data-kind="sequence">Sequence diagram</button>
      </div>
    </div>

    <div class="card">
      <h2>Code Search</h2>
      <div class="query-row">
        <input id="search-input" placeholder="Search for a file, symbol, or keyword" />
        <button id="search-btn" class="primary">Search</button>
      </div>
    </div>

    <div class="card">
      <h2>Ask Anything</h2>
      <div class="query-row">
        <input id="query-input" placeholder="How does auth work? What changed most recently?" />
        <button id="ask-btn" class="primary">Ask</button>
      </div>
      <div id="answer-box"></div>
      <div class="controls">
        <button id="play-answer">Play answer</button>
        <button id="stop-audio">Stop audio</button>
      </div>
    </div>
  </div>

  <div id="output" class="section">
    <div class="output-header">
      <div>
        <div id="output-title" style="font-size:16px;font-weight:600;"></div>
        <div id="output-subtitle" class="muted"></div>
      </div>
      <button id="back-btn">Back</button>
    </div>
    <div class="controls">
      <button id="play-result">Play result</button>
      <button id="stop-result">Stop audio</button>
    </div>
    <div id="output-body"></div>
  </div>

  <audio id="el-audio"></audio>
  <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi()
    const audio = document.getElementById('el-audio')
    let elevenLabsApiKey = ''
    let elevenLabsVoiceId = '21m00Tcm4TlvDq8ikWAM'
    let lastAnswerText = ''
    let lastResultText = ''

    if (window.mermaid) {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'neutral' })
    }

    document.querySelectorAll('[data-kind]').forEach(button => {
      button.addEventListener('click', () => {
        showLoading(button.dataset.kind + ' diagram')
        vscode.postMessage({ type: 'generateDiagram', kind: button.dataset.kind })
      })
    })
    document.querySelector('[data-action="architecture"]').addEventListener('click', () => {
      showLoading('Architecture map')
      vscode.postMessage({ type: 'architectureMap' })
    })
    document.getElementById('search-btn').addEventListener('click', () => sendSearch())
    document.getElementById('search-input').addEventListener('keydown', event => {
      if (event.key === 'Enter') sendSearch()
    })
    document.getElementById('ask-btn').addEventListener('click', () => sendQuery())
    document.getElementById('query-input').addEventListener('keydown', event => {
      if (event.key === 'Enter') sendQuery()
    })
    document.getElementById('back-btn').addEventListener('click', () => {
      stopAudio()
      document.getElementById('home').style.display = 'grid'
      document.getElementById('output').style.display = 'none'
    })
    document.getElementById('play-answer').addEventListener('click', () => speak(lastAnswerText))
    document.getElementById('stop-audio').addEventListener('click', stopAudio)
    document.getElementById('play-result').addEventListener('click', () => speak(lastResultText))
    document.getElementById('stop-result').addEventListener('click', stopAudio)

    function sendSearch() {
      const query = document.getElementById('search-input').value.trim()
      if (!query) return
      showLoading('Search: ' + query)
      vscode.postMessage({ type: 'searchCode', query })
    }

    function sendQuery() {
      const text = document.getElementById('query-input').value.trim()
      if (!text) return
      const box = document.getElementById('answer-box')
      box.style.display = 'block'
      box.textContent = 'Thinking...'
      vscode.postMessage({ type: 'query', text })
    }

    function showLoading(label) {
      document.getElementById('home').style.display = 'none'
      document.getElementById('output').style.display = 'grid'
      document.getElementById('output-title').textContent = label
      document.getElementById('output-subtitle').textContent = 'Generating from the local DevLog API'
      document.getElementById('output-body').innerHTML = '<div class="loading">Loading...</div>'
      lastResultText = ''
    }

    function stopAudio() {
      window.speechSynthesis.cancel()
      audio.pause()
      audio.src = ''
    }

    async function speak(text) {
      const trimmed = String(text || '').trim()
      if (!trimmed) return
      stopAudio()
      if (elevenLabsApiKey) {
        try {
          const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + elevenLabsVoiceId, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'xi-api-key': elevenLabsApiKey,
            },
            body: JSON.stringify({
              text: trimmed,
              model_id: 'eleven_multilingual_v2',
            }),
          })
          if (!response.ok) throw new Error('ElevenLabs ' + response.status)
          const blob = await response.blob()
          audio.src = URL.createObjectURL(blob)
          await audio.play()
          return
        } catch (err) {
          console.warn('ElevenLabs fallback:', err.message)
        }
      }
      const utterance = new SpeechSynthesisUtterance(trimmed)
      window.speechSynthesis.speak(utterance)
    }

    async function renderResult(label, data) {
      document.getElementById('home').style.display = 'none'
      document.getElementById('output').style.display = 'grid'
      document.getElementById('output-title').textContent = label
      document.getElementById('output-subtitle').textContent = data.summary || data.explanation || ''
      document.getElementById('output-body').innerHTML = ''

      const body = document.getElementById('output-body')
      const chunks = []
      if (data.title) chunks.push(data.title)
      if (data.summary) chunks.push(data.summary)
      if (data.explanation) chunks.push(data.explanation)

      if (data.mermaid) {
        const wrap = document.createElement('div')
        wrap.className = 'mermaid-wrap'
        const graph = document.createElement('div')
        graph.className = 'mermaid'
        graph.textContent = data.mermaid
        wrap.appendChild(graph)
        body.appendChild(wrap)
        if (window.mermaid) {
          try {
            await mermaid.run({ nodes: [graph] })
          } catch {
            graph.textContent = data.mermaid
          }
        }
      }

      if (Array.isArray(data.bullets) && data.bullets.length) {
        const list = document.createElement('ul')
        data.bullets.forEach(item => {
          const li = document.createElement('li')
          li.textContent = item
          list.appendChild(li)
          chunks.push(item)
        })
        body.appendChild(list)
      }

      if (Array.isArray(data.entrypoints) && data.entrypoints.length) {
        body.appendChild(renderReferenceBlock('Entrypoints', data.entrypoints))
        chunks.push('Entrypoints: ' + data.entrypoints.join(', '))
      }

      if (Array.isArray(data.hotspots) && data.hotspots.length) {
        body.appendChild(renderReferenceBlock('Hotspots', data.hotspots))
        chunks.push('Hotspots: ' + data.hotspots.join(', '))
      }

      if (Array.isArray(data.references) && data.references.length) {
        body.appendChild(renderReferenceBlock('References', data.references.map(item => item.filePath || item)))
      }

      if (Array.isArray(data.matches) && data.matches.length) {
        const list = document.createElement('div')
        list.className = 'list'
        data.matches.forEach(match => {
          const item = document.createElement('div')
          item.className = 'item'
          item.dataset.path = match.filePath
          item.innerHTML = '<div class="file">' + escapeHtml(match.filePath) + '</div>' +
            '<div class="summary">' + escapeHtml(match.snippet || '') + '</div>'
          item.addEventListener('click', () => {
            showLoading('Explain ' + match.filePath)
            vscode.postMessage({ type: 'explainFile', filePath: match.filePath })
          })
          list.appendChild(item)
          chunks.push(match.filePath)
        })
        body.appendChild(list)
      }

      if (!body.childNodes.length) {
        const pre = document.createElement('pre')
        pre.textContent = JSON.stringify(data, null, 2)
        body.appendChild(pre)
      }

      lastResultText = chunks.filter(Boolean).join('. ')
    }

    function renderReferenceBlock(title, items) {
      const section = document.createElement('div')
      section.className = 'section'
      const heading = document.createElement('div')
      heading.className = 'muted'
      heading.textContent = title
      section.appendChild(heading)
      const refs = document.createElement('div')
      refs.className = 'refs'
      items.forEach(item => {
        const code = document.createElement('code')
        code.textContent = typeof item === 'string' ? item : (item.filePath || '')
        refs.appendChild(code)
      })
      section.appendChild(refs)
      return section
    }

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
    }

    window.addEventListener('message', async event => {
      const msg = event.data
      if (msg.type === 'configure') {
        elevenLabsApiKey = msg.elevenLabsApiKey || ''
        elevenLabsVoiceId = msg.elevenLabsVoiceId || '21m00Tcm4TlvDq8ikWAM'
        return
      }
      if (msg.type === 'loading') {
        showLoading(msg.label)
        return
      }
      if (msg.type === 'error') {
        document.getElementById('output-body').innerHTML = '<div class="loading">' + escapeHtml(msg.message) + '</div>'
        return
      }
      if (msg.type === 'queryLoading') {
        const box = document.getElementById('answer-box')
        box.style.display = 'block'
        box.textContent = 'Thinking...'
        return
      }
      if (msg.type === 'queryError') {
        const box = document.getElementById('answer-box')
        box.style.display = 'block'
        box.textContent = msg.message
        return
      }
      if (msg.type === 'queryResult') {
        const box = document.getElementById('answer-box')
        box.style.display = 'block'
        box.textContent = msg.answer || 'No answer returned.'
        lastAnswerText = msg.answer || ''
        return
      }
      if (msg.type === 'result') {
        await renderResult(msg.label, msg.data || {})
      }
    })

    vscode.postMessage({ type: 'ready' })
  </script>
</body>
</html>`
}

module.exports = { DevLogPanel }
