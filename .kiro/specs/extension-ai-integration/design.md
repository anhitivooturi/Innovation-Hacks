# Design Document: Extension AI Integration

## Overview

This feature wires up the three AI capabilities in the DevLog VS Code extension that currently exist as stubs or partial implementations:

1. **Vertex AI / Gemini diagram generation** — the `/diagram` backend endpoint already calls `DevLogBrain.enhance_diagram()`, but the default model is `gemini-2.5-flash` and the Vertex AI gate (`DEVLOG_USE_VERTEX`) is off by default. We bump the default model to `gemini-2.5-pro` and document the env vars needed to enable it.

2. **Vertex AI / Gemini text conversation** — the `/query` endpoint already routes through `DevLogBrain.answer_query()`. Same gate applies; no code changes needed beyond the model default.

3. **ElevenLabs TTS** — `panel.js` currently uses the browser's `SpeechSynthesis` API. We replace the `speak()` function with an ElevenLabs REST call (POST `https://api.elevenlabs.io/v1/text-to-speech/{voiceId}`), add the two new VS Code settings, update the CSP, and add a fallback to `SpeechSynthesis` when the key is absent or the call fails.

The changes are deliberately minimal: no new backend endpoints, no new npm packages, no new Python dependencies. Everything builds on the existing message-passing architecture between the extension host and the webview.

## Architecture

```mermaid
graph TD
    subgraph VS Code Extension Host
        EXT[extension.js]
        PANEL[DevLogPanel / panel.js]
        CFG[VS Code Settings\ndevlog.*]
    end

    subgraph Webview iframe
        HTML[panel HTML + JS]
        SPEECH[Web Speech API\nwake word + STT]
        AUDIO[audio element\nElevenLabs playback]
        SYNTH[SpeechSynthesis\nfallback TTS]
    end

    subgraph Backend  server/app
        MAIN[main.py\nFastAPI]
        SVC[service.py\nDevLogService]
        BRAIN[llm.py\nDevLogBrain]
        CFG2[config.py\nSettings]
    end

    subgraph External
        VERTEX[Vertex AI\nGemini 2.5 Pro]
        ELEVEN[ElevenLabs\nTTS REST API]
    end

    CFG -->|read on open| EXT
    EXT -->|configure msg\n{elevenLabsApiKey, voiceId}| HTML
    HTML -->|postMessage\nquery / generateDiagram| EXT
    EXT -->|fetch POST| MAIN
    MAIN --> SVC --> BRAIN
    BRAIN -->|vertexai SDK| VERTEX
    VERTEX -->|text response| BRAIN
    BRAIN -->|DiagramResponse\nQueryResponse| MAIN
    MAIN -->|JSON| EXT
    EXT -->|postMessage result| HTML
    HTML -->|POST xi-api-key| ELEVEN
    ELEVEN -->|audio/mpeg blob| AUDIO
    SPEECH -->|transcript| HTML
    HTML -->|fallback| SYNTH
```

The data flow for a voice query:
1. Web Speech API detects "Hey DevLog" wake word in the webview
2. Webview captures the question via STT, posts `{ type: 'query', text }` to the extension host
3. Extension host POSTs to `/query`, gets back `{ answer }`
4. Webview POSTs answer text to ElevenLabs REST API with `xi-api-key` header
5. ElevenLabs returns `audio/mpeg`; webview creates a blob URL and plays it via `<audio>`
6. On `audio.onended`, the next wake-word listening cycle begins

## Components and Interfaces

### server/app/config.py

One change: the default value of `gemini_model` changes from `"gemini-2.5-flash"` to `"gemini-2.5-pro"`.

```python
gemini_model=os.getenv("DEVLOG_GEMINI_MODEL", "gemini-2.5-pro"),
```

`DevLogBrain.__init__` already logs nothing on startup; we add a single `print` so operators can confirm the active model:

```python
print(f"[DevLogBrain] Vertex AI enabled. Model: {settings.gemini_model}")
```

### server/app/llm.py

No structural changes. The `enhance_diagram` and `answer_query` methods already handle the Vertex AI call and fall back gracefully on any exception. The only addition is the startup log line in `__init__`.

### extension/package.json

Two new configuration contributions added under `contributes.configuration.properties`:

```json
"devlog.elevenLabsApiKey": {
  "type": "string",
  "default": "",
  "description": "ElevenLabs API key for voice TTS. Leave empty to use browser SpeechSynthesis."
},
"devlog.elevenLabsVoiceId": {
  "type": "string",
  "default": "21m00Tcm4TlvDq8ikWAM",
  "description": "ElevenLabs voice ID. Defaults to Rachel (21m00Tcm4TlvDq8ikWAM)."
}
```

### extension/src/extension.js

When `devlog.openPanel` is invoked (and whenever the panel is created), the extension reads the two new settings and sends a `configure` message to the webview:

```js
const cfg = vscode.workspace.getConfiguration('devlog')
panel._panel.webview.postMessage({
  type: 'configure',
  elevenLabsApiKey: cfg.get('elevenLabsApiKey', ''),
  elevenLabsVoiceId: cfg.get('elevenLabsVoiceId', '21m00Tcm4TlvDq8ikWAM'),
})
```

This is sent after `buildHomeHtml()` sets the webview HTML, inside `DevLogPanel.open()`.

### extension/src/panel.js

#### CSP update

```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none';
           style-src 'unsafe-inline';
           script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;
           connect-src https://api.elevenlabs.io;
           media-src blob:;">
```

#### configure message handler

Added to the `window.addEventListener('message', ...)` block:

```js
} else if (msg.type === 'configure') {
  elevenLabsApiKey   = msg.elevenLabsApiKey   || ''
  elevenLabsVoiceId  = msg.elevenLabsVoiceId  || '21m00Tcm4TlvDq8ikWAM'
}
```

Two module-level variables hold the values:

```js
let elevenLabsApiKey  = ''
let elevenLabsVoiceId = '21m00Tcm4TlvDq8ikWAM'
```

#### `<audio>` element

Added inside `<body>` (hidden):

```html
<audio id="el-audio" style="display:none"></audio>
```

#### `speak()` replacement

```js
let elAudioPlaying = false

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
      }
      el.play()
      document.getElementById('tts-play').style.display = 'none'
      document.getElementById('tts-stop').style.display = 'inline-block'
      return
    } catch (err) {
      // fall through to SpeechSynthesis
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
```

#### Stop button update

The stop button must also stop the `<audio>` element:

```js
document.getElementById('tts-stop').addEventListener('click', () => {
  speechSynthesis.cancel()
  const el = document.getElementById('el-audio')
  el.pause(); el.src = ''
  elAudioPlaying = false
  document.getElementById('tts-play').style.display = 'inline-block'
  document.getElementById('tts-stop').style.display = 'none'
})
```

#### Block new listen cycle while speaking

In `submitVoiceQuery`, the `setTimeout` that restarts the wake-word loop is guarded:

```js
function submitVoiceQuery(text) {
  document.getElementById('query-input').value = text
  document.getElementById('answer-box').style.display = 'block'
  document.getElementById('answer-box').textContent = '⏳ Thinking…'
  vscode.postMessage({ type: 'query', text })
  // Don't restart listening here — wait until audio finishes (see queryResult handler)
}
```

In the `queryResult` message handler, the listen restart is deferred until after audio ends:

```js
} else if (msg.type === 'queryResult') {
  const box = document.getElementById('answer-box')
  box.style.display = 'block'
  box.textContent = msg.answer
  if (autoSpeak) {
    await speak(msg.answer)
    // For ElevenLabs, onended restarts the loop; for SpeechSynthesis, restart immediately
    if (!elevenLabsApiKey && voiceOn) listenForWakeWord()
  } else if (voiceOn) {
    listenForWakeWord()
  }
}
```

For ElevenLabs, the `el.onended` callback in `speak()` is responsible for restarting the listen cycle when voice is on:

```js
el.onended = () => {
  elAudioPlaying = false
  URL.revokeObjectURL(url)
  document.getElementById('tts-play').style.display = 'inline-block'
  document.getElementById('tts-stop').style.display = 'none'
  if (voiceOn) listenForWakeWord()  // resume after ElevenLabs audio finishes
}
```

## Data Models

No new data models are introduced. The existing models are used as-is:

```python
# server/app/models.py (unchanged)
class DiagramResponse(BaseModel):
    kind: str
    title: str
    mermaid: str
    explanation: str
    summary: str | None = None
    bullets: list[str] = []
    references: list[str] = []

class QueryResponse(BaseModel):
    answer: str
```

The `configure` message from extension host to webview is an informal protocol (not typed), carrying:

```ts
{
  type: 'configure',
  elevenLabsApiKey: string,   // empty string if not set
  elevenLabsVoiceId: string,  // defaults to Rachel voice ID
}
```

### Environment variables (server)

| Variable | Default (before) | Default (after) | Purpose |
|---|---|---|---|
| `DEVLOG_USE_VERTEX` | `false` | `false` | Enable Vertex AI |
| `DEVLOG_GEMINI_MODEL` | `gemini-2.5-flash` | `gemini-2.5-pro` | Model name |
| `DEVLOG_GOOGLE_CLOUD_PROJECT` | _(empty)_ | _(empty)_ | GCP project ID |
| `DEVLOG_GCP_LOCATION` | `us-central1` | `us-central1` | GCP region |


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Extension routes messages to correct backend endpoints

*For any* `generateDiagram` message with a valid `kind` and `filePath`, the extension host SHALL POST to `/diagram` with those exact values; and for any `query` message with a non-empty `text`, the extension host SHALL POST to `/query` with `{ projectId, question: text }`.

**Validates: Requirements 1.2, 2.1**

### Property 2: Query prompt includes full context

*For any* `ProjectState` with N timeline events and a non-empty `markdown` string, the prompt passed to `generate_content` SHALL contain the full `markdown` string and exactly `min(N, 12)` timeline event entries.

**Validates: Requirements 2.2, 2.8**

### Property 3: DiagramResponse always has all required fields

*For any* diagram `kind` and optional `filePath`, the `DiagramResponse` returned by the backend SHALL always have a non-empty `mermaid` string, a non-empty `title`, a non-empty `explanation`, and a non-empty `kind` field — regardless of whether Vertex AI succeeds or falls back to the static analyzer.

**Validates: Requirements 1.4, 6.2, 6.3, 6.5**

### Property 4: Diagram prompt includes static analyzer output

*For any* diagram `kind`, the prompt passed to `generate_content` SHALL contain the static analyzer's base Mermaid output for that kind, so the AI enhancement is grounded in real codebase structure.

**Validates: Requirements 6.1**

### Property 5: speak() calls ElevenLabs with the answer text

*For any* non-empty answer string, when `elevenLabsApiKey` is set, the `speak()` function SHALL POST to `https://api.elevenlabs.io/v1/text-to-speech/{voiceId}` with a request body containing that exact answer string and the `xi-api-key` header set to the configured key.

**Validates: Requirements 4.4**

### Property 6: Voice listen cycle does not restart while audio is playing

*For any* answer text spoken via ElevenLabs, the `listenForWakeWord()` function SHALL NOT be called before the `audio.onended` event fires — ensuring the microphone does not open while the speaker is active.

**Validates: Requirements 4.11**

### Property 7: configure message carries exact settings values

*For any* values of `devlog.elevenLabsApiKey` and `devlog.elevenLabsVoiceId` in VS Code settings, the `configure` message sent to the webview SHALL contain those exact values (not defaults, not stale values).

**Validates: Requirements 5.3**

### Property 8: postJson uses the configured base URL

*For any* value of `devlog.apiBaseUrl` in VS Code settings, every call to `postJson(path, body)` SHALL construct the request URL as `${apiBaseUrl}${path}`, using the current setting value at call time.

**Validates: Requirements 5.5**

### Property 9: Nonce consistency in generated HTML

*For any* invocation of `buildHomeHtml()`, every `<script>` tag in the returned HTML SHALL have a `nonce` attribute equal to the nonce value referenced in the `Content-Security-Policy` `script-src` directive.

**Validates: Requirements 7.3**

### Property 10: Voice query posts correct message to extension

*For any* non-empty spoken transcript captured by the Web Speech API, `submitVoiceQuery(text)` SHALL call `vscode.postMessage({ type: 'query', text })` with that exact transcript text.

**Validates: Requirements 4.3**

## Error Handling

### Vertex AI unavailability

`DevLogBrain` wraps every `generate_content` call in a `try/except Exception`. On any failure (network error, quota exceeded, invalid response, timeout), the method returns the fallback result:
- `answer_query` → `_fallback_query()` (keyword-based timeline search)
- `enhance_diagram` → original static analyzer payload
- `summarize_change` → `_fallback_update()`

The backend never surfaces a 500 to the extension for AI failures. The extension only sees a valid response shape.

### ElevenLabs API failure

The `speak()` function in the webview catches any fetch error or non-2xx response and falls through to `SpeechSynthesis`. The error is logged via `console.warn` (visible in the webview DevTools). No user-facing error is shown for TTS failures — the audio simply plays via the browser voice instead.

If `elevenLabsApiKey` is empty, `speak()` skips the ElevenLabs branch entirely and goes straight to `SpeechSynthesis`.

### CSP violations

The updated CSP explicitly allows `connect-src https://api.elevenlabs.io` and `media-src blob:`. Any other external connection attempt will be blocked by the browser and logged to the VS Code developer console. The nonce on all `<script>` tags prevents inline script injection.

### Model not available

If `DEVLOG_USE_VERTEX=false` (the default), `DevLogBrain._model` is `None` and all methods immediately return their fallback results. No Vertex AI calls are made. The startup log line is only printed when `use_vertex=True`.

### Timeout (diagram endpoint)

The 30-second timeout for the `/diagram` endpoint is enforced by the existing `try/except` in `enhance_diagram`. If Vertex AI takes longer than the FastAPI request timeout (configurable via uvicorn), the exception is caught and the static fallback is returned.

## Testing Strategy

### Unit tests (example-based)

These cover specific behaviors and error paths:

- `test_config_default_model` — verify `Settings.gemini_model` defaults to `"gemini-2.5-pro"` when `DEVLOG_GEMINI_MODEL` is unset
- `test_config_env_override` — verify `DEVLOG_GEMINI_MODEL=gemini-2.5-flash` overrides the default
- `test_brain_startup_log` — capture stdout during `DevLogBrain.__init__` with `use_vertex=True`, verify model name is printed
- `test_brain_vertex_disabled` — verify `_model is None` when `use_vertex=False`
- `test_answer_query_fallback` — mock `generate_content` to raise, verify `_fallback_query` result is returned
- `test_enhance_diagram_fallback` — mock `generate_content` to raise, verify original payload is returned
- `test_speak_no_key` — with empty `elevenLabsApiKey`, verify `speechSynthesis.speak()` is called
- `test_speak_elevenlabs_error` — mock fetch to return 500, verify `speechSynthesis.speak()` is called as fallback
- `test_audio_play_on_success` — mock fetch to return audio blob, verify `audio.play()` is called
- `test_voice_toggle_starts_recognition` — toggle voice on, verify `SpeechRecognition.start()` is called

### Property-based tests

Using **fast-check** (JavaScript, for webview logic) and **Hypothesis** (Python, for backend logic).

Each property test runs a minimum of **100 iterations**.

**Python (Hypothesis) — server/tests/test_properties.py**

```python
# Feature: extension-ai-integration, Property 2: Query prompt includes full context
@given(st.builds(ProjectState, ...), st.text(min_size=1))
@settings(max_examples=100)
def test_query_prompt_includes_context(state, question):
    # verify prompt contains markdown and min(len(timeline), 12) events

# Feature: extension-ai-integration, Property 3: DiagramResponse always has required fields
@given(st.sampled_from(['architecture','dependency','flow','class','sequence']), st.text())
@settings(max_examples=100)
def test_diagram_response_always_complete(kind, file_path):
    # verify mermaid, title, explanation, kind are all non-empty

# Feature: extension-ai-integration, Property 4: Diagram prompt includes static analyzer output
@given(st.sampled_from(['architecture','dependency','flow','class']))
@settings(max_examples=100)
def test_diagram_prompt_includes_static_output(kind):
    # verify prompt passed to generate_content contains static analyzer mermaid
```

**JavaScript (fast-check) — extension/tests/properties.test.js**

```js
// Feature: extension-ai-integration, Property 1: Extension routes messages to correct endpoints
fc.assert(fc.property(fc.string(), fc.string(), (kind, filePath) => {
  // simulate generateDiagram message, verify fetch called with /diagram
}), { numRuns: 100 })

// Feature: extension-ai-integration, Property 5: speak() calls ElevenLabs with answer text
fc.assert(fc.property(fc.string({ minLength: 1 }), async (answer) => {
  // with key set, verify fetch POST body contains answer text
}), { numRuns: 100 })

// Feature: extension-ai-integration, Property 6: Voice listen cycle does not restart while audio plays
fc.assert(fc.property(fc.string({ minLength: 1 }), async (answer) => {
  // verify listenForWakeWord not called before audio.onended
}), { numRuns: 100 })

// Feature: extension-ai-integration, Property 7: configure message carries exact settings values
fc.assert(fc.property(fc.string(), fc.string(), (apiKey, voiceId) => {
  // verify postMessage configure contains exact values
}), { numRuns: 100 })

// Feature: extension-ai-integration, Property 8: postJson uses configured base URL
fc.assert(fc.property(fc.webUrl(), fc.string(), (baseUrl, path) => {
  // verify fetch URL is baseUrl + path
}), { numRuns: 100 })

// Feature: extension-ai-integration, Property 9: Nonce consistency in generated HTML
fc.assert(fc.property(fc.constant(null), () => {
  const html = buildHomeHtml()
  // extract nonce from CSP, verify all script tags use same nonce
}), { numRuns: 100 })

// Feature: extension-ai-integration, Property 10: Voice query posts correct message
fc.assert(fc.property(fc.string({ minLength: 1 }), (transcript) => {
  submitVoiceQuery(transcript)
  // verify vscode.postMessage called with { type: 'query', text: transcript }
}), { numRuns: 100 })
```

### Integration tests

- Start the FastAPI server with `DEVLOG_USE_VERTEX=true` and a real GCP project, call `/diagram` and `/query`, verify response shapes match the models
- Verify ElevenLabs API key produces audio by calling the REST endpoint directly (manual / CI with secret)
