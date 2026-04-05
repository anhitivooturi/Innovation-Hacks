const vscode = require('vscode')

class DevLogPanel {
  constructor(extensionUri) {
    this.extensionUri = extensionUri
    this._panel = undefined
  }

  open() {
    if (this._panel) { this._panel.reveal(vscode.ViewColumn.One); return }
    this._panel = vscode.window.createWebviewPanel(
      'devlogMain', 'DevLog — Project Explorer', vscode.ViewColumn.One,
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

  _send(msg) { this._panel?.webview.postMessage(msg) }
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
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; connect-src https://api.elevenlabs.io; media-src blob:;">
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:var(--vscode-font-family);background:var(--vscode-editor-background);color:var(--vscode-foreground);padding:24px;display:grid;gap:20px}
    h1{font-size:20px;font-weight:600;margin-bottom:4px}
    h2{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground);margin-bottom:12px}
    .card{border:1px solid var(--vscode-panel-border);border-radius:12px;padding:16px}
    .diagram-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
    .diagram-btn{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:1px solid var(--vscode-panel-border);border-radius:8px;padding:10px 6px;cursor:pointer;font-size:12px;text-align:center;transition:background .15s}
    .diagram-btn:hover{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
    .diagram-btn .icon{font-size:20px;display:block;margin-bottom:5px}
    .primary-btn{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font-size:13px}
    .primary-btn:hover{opacity:.9}
    /* voice toggle */
    .voice-bar{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--vscode-textBlockQuote-background);border-radius:10px;border:1px solid var(--vscode-panel-border)}
    .voice-toggle{position:relative;width:40px;height:22px;flex-shrink:0}
    .voice-toggle input{opacity:0;width:0;height:0}
    .voice-slider{position:absolute;inset:0;background:var(--vscode-input-border);border-radius:22px;cursor:pointer;transition:.2s}
    .voice-slider:before{content:'';position:absolute;width:16px;height:16px;left:3px;top:3px;background:white;border-radius:50%;transition:.2s}
    input:checked + .voice-slider{background:var(--vscode-button-background)}
    input:checked + .voice-slider:before{transform:translateX(18px)}
    .voice-info{flex:1;font-size:12px}
    .voice-info strong{display:block;font-size:13px}
    .voice-info span{color:var(--vscode-descriptionForeground);font-size:11px}
    .mic-indicator{width:10px;height:10px;border-radius:50%;background:var(--vscode-input-border);flex-shrink:0;transition:background .3s}
    .mic-indicator.listening{background:#f44;box-shadow:0 0 6px #f44;animation:pulse 1s infinite}
    .mic-indicator.heard{background:#4caf50}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    .voice-status{font-size:11px;color:var(--vscode-descriptionForeground);min-height:16px}
    /* output */
    #output{display:none}
    .output-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
    .back-btn{background:none;border:none;color:var(--vscode-textLink-foreground);cursor:pointer;font-size:12px}
    .mermaid-wrap{overflow:auto;background:var(--vscode-editor-background);border-radius:8px;padding:12px}
    .explanation{white-space:pre-wrap;font-size:13px;line-height:1.6;margin-top:12px}
    .file-list{display:grid;gap:8px}
    .file-item{border:1px solid var(--vscode-panel-border);border-radius:8px;padding:10px 14px;cursor:pointer}
    .file-item:hover{background:var(--vscode-list-hoverBackground)}
    .file-path{font-family:var(--vscode-editor-font-family);font-size:12px;color:var(--vscode-textLink-foreground)}
    .file-desc{font-size:12px;color:var(--vscode-descriptionForeground);margin-top:3px}
    .spinner{display:inline-block;width:14px;height:14px;border:2px solid var(--vscode-panel-border);border-top-color:var(--vscode-button-background);border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:8px}
    @keyframes spin{to{transform:rotate(360deg)}}
    .loading-msg{color:var(--vscode-descriptionForeground);font-size:13px;padding:24px 0}
    .error-msg{color:var(--vscode-list-errorForeground);font-size:13px;padding:12px}
    /* ask */
    .query-row{display:flex;gap:8px}
    .query-input{flex:1;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:8px;padding:8px 12px;font-size:13px}
    .query-input::placeholder{color:var(--vscode-input-placeholderForeground)}
    .answer-box{margin-top:12px;padding:12px;background:var(--vscode-textBlockQuote-background);border-left:3px solid var(--vscode-button-background);border-radius:4px;font-size:13px;line-height:1.6;white-space:pre-wrap;display:none}
    /* tts bar */
    .tts-bar{display:none;align-items:center;gap:8px;margin-top:14px;padding:8px 12px;background:var(--vscode-textBlockQuote-background);border-radius:8px;border:1px solid var(--vscode-panel-border)}
    .tts-bar.visible{display:flex}
    .tts-btn{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px}
    .tts-btn.sec{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
    .tts-speed{background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:4px;padding:3px 6px;font-size:11px;width:68px}
    .tts-label{font-size:11px;color:var(--vscode-descriptionForeground);flex:1}
  </style>
</head>
<body>

<audio id="el-audio" style="display:none"></audio>

<!-- HOME -->
<div id="home">
  <div>
    <h1>DevLog Project Explorer</h1>
    <p style="color:var(--vscode-descriptionForeground);font-size:13px;margin-top:4px">Understand any codebase — diagrams, file breakdowns, and natural language answers.</p>
  </div>

  <!-- Voice assistant toggle -->
  <div class="voice-bar">
    <div style="display:flex;flex-direction:column;gap:4px;flex:1">
      <div style="display:flex;align-items:center;gap:10px">
        <label class="voice-toggle">
          <input type="checkbox" id="voice-toggle"/>
          <span class="voice-slider"></span>
        </label>
        <div class="voice-info">
          <strong>🎙️ Voice Assistant</strong>
          <span>Say "Hey DevLog" then ask your question</span>
        </div>
        <div class="mic-indicator" id="mic-dot"></div>
      </div>
      <div class="voice-status" id="voice-status">Voice off</div>
    </div>
  </div>

  <!-- Diagrams -->
  <div class="card">
    <h2>Diagrams</h2>
    <div class="diagram-grid">
      <button class="diagram-btn" data-kind="architecture"><span class="icon">🏗️</span>Architecture</button>
      <button class="diagram-btn" data-kind="dependency"><span class="icon">🔗</span>Dependencies</button>
      <button class="diagram-btn" data-kind="flow"><span class="icon">🔀</span>Flow Chart</button>
      <button class="diagram-btn" data-kind="class"><span class="icon">🧱</span>Class / UML</button>
      <button class="diagram-btn" data-kind="sequence"><span class="icon">📨</span>Sequence</button>
      <button class="diagram-btn" data-kind="database"><span class="icon">🗄️</span>Database / ERD</button>
      <button class="diagram-btn" data-kind="api"><span class="icon">🌐</span>API Routes</button>
      <button class="diagram-btn" data-kind="component"><span class="icon">🧩</span>Components</button>
    </div>
  </div>

  <!-- Files breakdown -->
  <div class="card">
    <h2>Files Breakdown</h2>
    <p style="font-size:13px;color:var(--vscode-descriptionForeground);margin-bottom:12px">Plain-English explanation of every file and folder.</p>
    <button class="primary-btn" id="explain-files-btn">Explain All Files</button>
  </div>

  <!-- Ask anything -->
  <div class="card">
    <h2>Ask Anything</h2>
    <div class="query-row">
      <input class="query-input" id="query-input" placeholder="e.g. How does auth work? What does service.py do?"/>
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
  <div class="tts-bar" id="tts-bar">
    <span class="tts-label">🔊 Read aloud</span>
    <select class="tts-speed" id="tts-speed">
      <option value="0.75">0.75×</option>
      <option value="1" selected>1×</option>
      <option value="1.25">1.25×</option>
      <option value="1.5">1.5×</option>
    </select>
    <button class="tts-btn" id="tts-play">▶ Play</button>
    <button class="tts-btn sec" id="tts-stop" style="display:none">■ Stop</button>
  </div>
</div>

<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi()
  mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'neutral' })

  // ── ElevenLabs config (populated via configure message from extension host) ──
  let elevenLabsApiKey  = ''
  let elevenLabsVoiceId = '21m00Tcm4TlvDq8ikWAM'
  let elAudioPlaying    = false

  // ── Persist state across panel hides ─────────────────────────────
  const saved = vscode.getState() || {}
  let autoSpeak = saved.autoSpeak || false
  let ttsSpeed  = saved.ttsSpeed  || 1
  let _ttsText  = ''

  function saveState() {
    vscode.setState({ autoSpeak, ttsSpeed })
  }

  // Restore toggle + speed on load
  document.getElementById('voice-toggle').checked = autoSpeak  // reuse toggle for autoSpeak? No — separate
  document.getElementById('tts-speed').value = ttsSpeed

  // ── Auto-speak toggle (on home page, separate from voice) ─────────
  // We'll add it inline next to the voice bar — actually wire voice-toggle
  // to BOTH voice recognition AND auto-speak so one toggle does both.

  // ── Voice Recognition ─────────────────────────────────────────────
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  let recognition = null
  let voiceOn = false
  let awaitingQuestion = false

  const micDot    = document.getElementById('mic-dot')
  const voiceStat = document.getElementById('voice-status')
  const toggle    = document.getElementById('voice-toggle')

  // Restore toggle state
  toggle.checked = saved.voiceOn || false
  if (toggle.checked) startVoice()

  toggle.addEventListener('change', () => {
    if (toggle.checked) {
      startVoice()
      autoSpeak = true
    } else {
      stopVoice()
      autoSpeak = false
    }
    saveState()
  })

  function startVoice() {
    if (!SpeechRecognition) {
      voiceStat.textContent = '⚠️ Speech recognition not supported in this browser'
      toggle.checked = false
      return
    }
    voiceOn = true
    voiceStat.textContent = '👂 Listening for "Hey DevLog"…'
    micDot.className = 'mic-indicator listening'
    listenForWakeWord()
  }

  function stopVoice() {
    voiceOn = false
    awaitingQuestion = false
    recognition?.abort()
    recognition = null
    micDot.className = 'mic-indicator'
    voiceStat.textContent = 'Voice off'
  }

  function listenForWakeWord() {
    if (!voiceOn) return
    recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript.trim().toLowerCase()
      voiceStat.textContent = '🎙️ Heard: "' + transcript + '"'

      if (awaitingQuestion) {
        // Strip wake word if they repeated it
        const clean = transcript.replace(/^hey\s+devlog[,.]?\s*/i, '').trim()
        if (clean) {
          awaitingQuestion = false
          micDot.className = 'mic-indicator heard'
          voiceStat.textContent = '💬 "' + clean + '"'
          submitVoiceQuery(clean)
        } else {
          awaitingQuestion = false
          listenForWakeWord()
        }
        return
      }

      if (transcript.includes('hey devlog')) {
        // Wake word detected — now listen for the question
        awaitingQuestion = true
        micDot.className = 'mic-indicator heard'
        voiceStat.textContent = '✅ Hey DevLog! What\'s your question?'
        speak('Yes?')
        setTimeout(() => listenForQuestion(), 800)
      } else {
        listenForWakeWord()
      }
    }

    recognition.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') {
        if (voiceOn) listenForWakeWord()
        return
      }
      voiceStat.textContent = '⚠️ Mic error: ' + e.error
    }

    recognition.onend = () => {
      if (voiceOn && !awaitingQuestion) listenForWakeWord()
    }

    recognition.start()
  }

  function listenForQuestion() {
    if (!voiceOn) return
    recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'
    micDot.className = 'mic-indicator listening'
    voiceStat.textContent = '🎙️ Listening for your question…'

    recognition.onresult = (e) => {
      const question = e.results[0][0].transcript.trim().replace(/^hey\s+devlog[,.]?\s*/i, '')
      awaitingQuestion = false
      micDot.className = 'mic-indicator heard'
      voiceStat.textContent = '💬 "' + question + '"'
      submitVoiceQuery(question)
    }

    recognition.onerror = (e) => {
      awaitingQuestion = false
      voiceStat.textContent = e.error === 'no-speech' ? '🤔 Didn\'t catch that, try again' : '⚠️ ' + e.error
      if (voiceOn) setTimeout(listenForWakeWord, 1500)
    }

    recognition.onend = () => {
      if (voiceOn && awaitingQuestion) listenForQuestion()
    }

    recognition.start()
  }

  function submitVoiceQuery(text) {
    // Fill the input so user can see what was heard
    document.getElementById('query-input').value = text
    document.getElementById('answer-box').style.display = 'block'
    document.getElementById('answer-box').textContent = '⏳ Thinking…'
    vscode.postMessage({ type: 'query', text })
    // Don't restart listening here — wait until audio finishes (see queryResult handler / el.onended)
  }

  // ── TTS helpers ───────────────────────────────────────────────────
  async function speak(text, rate) {
    if (!text) return
    if (elevenLabsApiKey) {
      try {
        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`,
          {
            method: 'POST',
            headers: { 'xi-api-key': elevenLabsApiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, model_id: 'eleven_monolingual_v1' }),
          }
        )
        if (!res.ok) throw new Error(`ElevenLabs ${res.status}`)
        const blob = await res.blob()
        const url  = URL.createObjectURL(blob)
        const el   = document.getElementById('el-audio')
        el.src = url
        elAudioPlaying = true
        el.onended = () => {
          elAudioPlaying = false
          URL.revokeObjectURL(url)
          document.getElementById('tts-play').style.display = 'inline-block'
          document.getElementById('tts-stop').style.display = 'none'
          if (voiceOn) listenForWakeWord()
        }
        el.play()
        document.getElementById('tts-play').style.display = 'none'
        document.getElementById('tts-stop').style.display = 'inline-block'
        return
      } catch (err) {
        console.warn('ElevenLabs TTS failed, falling back:', err.message)
      }
    }
    // SpeechSynthesis fallback
    speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate = rate || parseFloat(document.getElementById('tts-speed').value)
    utt.onend = () => {
      document.getElementById('tts-play').style.display = 'inline-block'
      document.getElementById('tts-stop').style.display = 'none'
    }
    speechSynthesis.speak(utt)
    document.getElementById('tts-play').style.display = 'none'
    document.getElementById('tts-stop').style.display = 'inline-block'
  }

  function setTtsText(text) {
    _ttsText = text
    speechSynthesis.cancel()
    document.getElementById('tts-bar').classList.toggle('visible', !!text.trim())
    document.getElementById('tts-play').style.display = 'inline-block'
    document.getElementById('tts-stop').style.display = 'none'
    if (autoSpeak && text.trim()) speak(text)
  }

  document.getElementById('tts-play').addEventListener('click', () => speak(_ttsText))
  document.getElementById('tts-stop').addEventListener('click', () => {
    speechSynthesis.cancel()
    const el = document.getElementById('el-audio')
    el.pause(); el.src = ''
    elAudioPlaying = false
    document.getElementById('tts-play').style.display = 'inline-block'
    document.getElementById('tts-stop').style.display = 'none'
  })
  document.getElementById('tts-speed').addEventListener('change', (e) => {
    ttsSpeed = parseFloat(e.target.value)
    saveState()
  })

  // ── Navigation ────────────────────────────────────────────────────
  document.getElementById('back-btn').addEventListener('click', () => {
    speechSynthesis.cancel()
    document.getElementById('home').style.display = 'grid'
    document.getElementById('output').style.display = 'none'
  })

  function showLoading(label) {
    document.getElementById('home').style.display = 'none'
    document.getElementById('output').style.display = 'block'
    document.getElementById('tts-bar').classList.remove('visible')
    document.getElementById('output-title').textContent = label
    document.getElementById('output-body').innerHTML = '<div class="loading-msg"><span class="spinner"></span>Generating ' + esc(label) + '…</div>'
  }

  // ── Diagram + file buttons ────────────────────────────────────────
  document.querySelectorAll('.diagram-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showLoading(btn.textContent.trim() + ' diagram')
      vscode.postMessage({ type: 'generateDiagram', kind: btn.dataset.kind })
    })
  })

  document.getElementById('explain-files-btn').addEventListener('click', () => {
    showLoading('Files breakdown')
    vscode.postMessage({ type: 'explainFiles' })
  })

  // ── Ask anything ──────────────────────────────────────────────────
  document.getElementById('ask-btn').addEventListener('click', sendQuery)
  document.getElementById('query-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendQuery() })
  function sendQuery() {
    const text = document.getElementById('query-input').value.trim()
    if (!text) return
    document.getElementById('answer-box').style.display = 'block'
    document.getElementById('answer-box').textContent = '⏳ Thinking…'
    vscode.postMessage({ type: 'query', text })
  }

  // ── Messages from extension host ─────────────────────────────────
  window.addEventListener('message', async e => {
    const msg = e.data
    if (msg.type === 'loading') {
      showLoading(msg.label)
    } else if (msg.type === 'error') {
      document.getElementById('output-body').innerHTML =
        '<div class="error-msg">⚠️ ' + esc(msg.message) + '<br><small>Make sure the DevLog backend is running.</small></div>'
      if (autoSpeak) speak('Error: ' + msg.message)
    } else if (msg.type === 'queryResult') {
      const box = document.getElementById('answer-box')
      box.style.display = 'block'
      box.textContent = msg.answer
      if (autoSpeak) {
        speak(msg.answer)
        // For SpeechSynthesis path (no ElevenLabs key), restart listen loop immediately
        if (!elevenLabsApiKey && voiceOn) listenForWakeWord()
        // For ElevenLabs path, el.onended inside speak() handles restarting the loop
      } else if (voiceOn) {
        micDot.className = 'mic-indicator listening'
        voiceStat.textContent = '👂 Listening for "Hey DevLog"…'
        listenForWakeWord()
      }
    } else if (msg.type === 'configure') {
      elevenLabsApiKey  = msg.elevenLabsApiKey  || ''
      elevenLabsVoiceId = msg.elevenLabsVoiceId || '21m00Tcm4TlvDq8ikWAM'
    } else if (msg.type === 'result') {
      await renderResult(msg.label, msg.data)
    }
  })

  // ── Render result ─────────────────────────────────────────────────
  async function renderResult(label, data) {
    document.getElementById('output-title').textContent = label
    const body = document.getElementById('output-body')
    let speakText = ''

    if (data.mermaid) {
      const id = 'mermaid-' + Date.now()
      body.innerHTML =
        '<div class="mermaid-wrap"><div id="' + id + '" class="mermaid">' + esc(data.mermaid) + '</div></div>' +
        (data.summary || data.explanation ? '<p class="explanation">' + esc(data.summary || data.explanation) + '</p>' : '') +
        renderBullets(data.bullets || data.body || []) +
        renderRefs(data.references || data.entrypoints || [])
      try { await mermaid.run({ querySelector: '#' + id }) }
      catch { document.getElementById(id).textContent = data.mermaid }
      speakText = [label, data.summary || data.explanation, ...(data.bullets || data.body || [])].filter(Boolean).join('. ')
      setTtsText(speakText)
      return
    }

    if (data.files || data.fileTree) {
      const files = data.files || data.fileTree || []
      body.innerHTML = '<div class="file-list">' + files.map(f =>
        '<div class="file-item" data-path="' + esc(f.path || f.filePath || f) + '">' +
        '<div class="file-path">' + esc(f.path || f.filePath || f) + '</div>' +
        (f.description || f.summary ? '<div class="file-desc">' + esc(f.description || f.summary) + '</div>' : '') +
        '</div>'
      ).join('') + '</div>'
      body.querySelectorAll('.file-item').forEach(item => {
        item.addEventListener('click', () => {
          showLoading('Explaining ' + item.dataset.path)
          vscode.postMessage({ type: 'explainFile', filePath: item.dataset.path })
        })
      })
      speakText = files.map(f => {
        const name = f.path || f.filePath || f
        const desc = f.description || f.summary || ''
        return desc ? name + ': ' + desc : name
      }).join('. ')
      setTtsText(speakText)
      return
    }

    body.innerHTML =
      (data.title ? '<h2 style="margin-bottom:8px">' + esc(data.title) + '</h2>' : '') +
      (data.summary || data.explanation ? '<p class="explanation">' + esc(data.summary || data.explanation) + '</p>' : '') +
      renderBullets(data.bullets || data.body || []) +
      renderRefs(data.references || []) +
      '<pre style="margin-top:12px;font-size:12px;white-space:pre-wrap">' + esc(JSON.stringify(data, null, 2)) + '</pre>'
    speakText = [data.title, data.summary || data.explanation, ...(data.bullets || data.body || [])].filter(Boolean).join('. ')
    setTtsText(speakText)
  }

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
