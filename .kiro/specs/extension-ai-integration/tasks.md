# Implementation Plan: Extension AI Integration

## Overview

Surgical, minimal changes across 6 files to wire up Gemini 2.5 Pro as the default model, add a startup log, expose ElevenLabs settings, and replace the SpeechSynthesis-only `speak()` with an ElevenLabs-first implementation with fallback. No new dependencies.

## Tasks

- [x] 1. Update backend default model and add startup log
  - [x] 1.1 Change `gemini_model` default in `server/app/config.py` from `"gemini-2.5-flash"` to `"gemini-2.5-pro"`
    - Edit the `load_settings()` return statement: `gemini_model=os.getenv("DEVLOG_GEMINI_MODEL", "gemini-2.5-pro")`
    - _Requirements: 3.1, 3.3_

  - [ ]* 1.2 Write unit test for config default model
    - `test_config_default_model` — unset `DEVLOG_GEMINI_MODEL`, verify `Settings.gemini_model == "gemini-2.5-pro"`
    - `test_config_env_override` — set `DEVLOG_GEMINI_MODEL=gemini-2.5-flash`, verify override is respected
    - _Requirements: 3.3_

  - [x] 1.3 Add startup log line in `server/app/llm.py` `DevLogBrain.__init__`
    - After `self._model = GenerativeModel(settings.gemini_model)`, add: `print(f"[DevLogBrain] Vertex AI enabled. Model: {settings.gemini_model}")`
    - Log is only emitted when `use_vertex=True` and vertexai is available (already gated by the existing `if` block)
    - _Requirements: 3.4_

  - [ ]* 1.4 Write unit test for startup log
    - `test_brain_startup_log` — construct `DevLogBrain` with `use_vertex=True` and mocked vertexai, capture stdout, verify model name is printed
    - `test_brain_vertex_disabled` — construct with `use_vertex=False`, verify nothing is printed and `_model is None`
    - _Requirements: 3.4, 3.5_

  - [x] 1.5 Update `server/.env.example` — change the `DEVLOG_GEMINI_MODEL` comment/default line to reflect `gemini-2.5-pro`
    - _Requirements: 3.3_

- [x] 2. Checkpoint — backend changes complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Add ElevenLabs settings to extension manifest
  - [x] 3.1 Add two new properties to `contributes.configuration.properties` in `extension/package.json`
    - `devlog.elevenLabsApiKey`: type string, default `""`, description "ElevenLabs API key for voice TTS. Leave empty to use browser SpeechSynthesis."
    - `devlog.elevenLabsVoiceId`: type string, default `"21m00Tcm4TlvDq8ikWAM"`, description "ElevenLabs voice ID. Defaults to Rachel (21m00Tcm4TlvDq8ikWAM)."
    - _Requirements: 5.1, 5.2_

- [x] 4. Send configure message from extension host to panel
  - [x] 4.1 In `extension/src/extension.js`, after `panel.open()` in the `devlog.openPanel` command handler, read `devlog.elevenLabsApiKey` and `devlog.elevenLabsVoiceId` from VS Code config and post a `configure` message to the panel webview
    - `const cfg = vscode.workspace.getConfiguration('devlog')`
    - `panel._panel.webview.postMessage({ type: 'configure', elevenLabsApiKey: cfg.get('elevenLabsApiKey', ''), elevenLabsVoiceId: cfg.get('elevenLabsVoiceId', '21m00Tcm4TlvDq8ikWAM') })`
    - Send after `panel.open()` returns (panel is revealed or newly created)
    - _Requirements: 5.3_

  - [ ]* 4.2 Write property test for configure message (Property 7)
    - **Property 7: configure message carries exact settings values**
    - **Validates: Requirements 5.3**
    - Use fast-check: for any `(apiKey, voiceId)` strings, mock `vscode.workspace.getConfiguration`, invoke the command handler, verify `postMessage` was called with `{ type: 'configure', elevenLabsApiKey: apiKey, elevenLabsVoiceId: voiceId }`
    - _Requirements: 5.3_

- [x] 5. Update panel webview — CSP, audio element, variables, and configure handler
  - [x] 5.1 Update the CSP `<meta>` tag in `buildHomeHtml()` in `extension/src/panel.js`
    - Add `connect-src https://api.elevenlabs.io;` and `media-src blob:;` directives
    - Final CSP: `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; connect-src https://api.elevenlabs.io; media-src blob:;`
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 5.2 Write property test for nonce consistency (Property 9)
    - **Property 9: Nonce consistency in generated HTML**
    - **Validates: Requirements 7.3**
    - Use fast-check: call `buildHomeHtml()`, extract nonce from CSP `script-src`, verify every `<script nonce="...">` tag uses that same nonce value
    - _Requirements: 7.3_

  - [x] 5.3 Add hidden `<audio id="el-audio">` element inside `<body>` in `buildHomeHtml()`
    - `<audio id="el-audio" style="display:none"></audio>`
    - _Requirements: 4.5_

  - [x] 5.4 Add module-level variables and `configure` message handler in the inline `<script>` block
    - Declare `let elevenLabsApiKey = ''` and `let elevenLabsVoiceId = '21m00Tcm4TlvDq8ikWAM'` near the top of the script
    - In the `window.addEventListener('message', ...)` handler, add an `else if (msg.type === 'configure')` branch that sets both variables from `msg.elevenLabsApiKey` and `msg.elevenLabsVoiceId`
    - _Requirements: 4.8, 4.9, 5.3_

- [x] 6. Replace `speak()` with ElevenLabs-first implementation
  - [x] 6.1 Replace the existing `speak()` function in `panel.js` with the ElevenLabs-first version
    - If `elevenLabsApiKey` is set: POST to `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}` with `xi-api-key` header and `{ text, model_id: 'eleven_monolingual_v1' }` body
    - On success: create blob URL, set `el-audio.src`, call `el.play()`, update play/stop button visibility
    - On any fetch error or non-2xx: `console.warn` and fall through to SpeechSynthesis
    - If `elevenLabsApiKey` is empty: go straight to SpeechSynthesis (existing logic)
    - Add `let elAudioPlaying = false` module-level variable; set to `true` on play, `false` on `onended`
    - _Requirements: 4.4, 4.5, 4.6, 4.7_

  - [ ]* 6.2 Write property test for speak() ElevenLabs call (Property 5)
    - **Property 5: speak() calls ElevenLabs with the answer text**
    - **Validates: Requirements 4.4**
    - Use fast-check: for any non-empty answer string with `elevenLabsApiKey` set, mock `fetch`, call `speak(answer)`, verify `fetch` was called with the correct URL, `xi-api-key` header, and body containing the exact answer text
    - _Requirements: 4.4_

  - [ ]* 6.3 Write unit test for speak() fallback on ElevenLabs error
    - `test_speak_elevenlabs_error` — mock fetch to return 500, verify `speechSynthesis.speak()` is called
    - `test_speak_no_key` — with empty `elevenLabsApiKey`, verify `speechSynthesis.speak()` is called directly without fetch
    - `test_audio_play_on_success` — mock fetch to return audio blob, verify `audio.play()` is called
    - _Requirements: 4.6, 4.7_

- [x] 7. Update stop button and fix voice listen-cycle sequencing
  - [x] 7.1 Update the `tts-stop` click handler in `panel.js` to also pause the `<audio>` element
    - Add `const el = document.getElementById('el-audio'); el.pause(); el.src = ''` and `elAudioPlaying = false` before resetting button visibility
    - _Requirements: 4.11_

  - [x] 7.2 Fix `submitVoiceQuery` — remove the `setTimeout(() => listenForWakeWord(), 500)` call
    - The listen restart is now deferred to the `queryResult` handler and `audio.onended`
    - _Requirements: 4.11_

  - [x] 7.3 Fix `queryResult` message handler — defer listen restart until after audio ends
    - After `await speak(msg.answer)`: if `elevenLabsApiKey` is set, the `el.onended` callback in `speak()` calls `listenForWakeWord()`; if not (SpeechSynthesis path), call `listenForWakeWord()` directly after `speak()` returns
    - Update `el.onended` inside `speak()` to call `if (voiceOn) listenForWakeWord()` after revoking the blob URL
    - _Requirements: 4.11_

  - [ ]* 7.4 Write property test for voice listen cycle guard (Property 6)
    - **Property 6: Voice listen cycle does not restart while audio is playing**
    - **Validates: Requirements 4.11**
    - Use fast-check: for any non-empty answer string with ElevenLabs key set, mock `fetch` and `audio.play`, call `speak(answer)`, verify `listenForWakeWord` is NOT called before `audio.onended` fires
    - _Requirements: 4.11_

  - [ ]* 7.5 Write property test for voice query message (Property 10)
    - **Property 10: Voice query posts correct message to extension**
    - **Validates: Requirements 4.3**
    - Use fast-check: for any non-empty transcript string, call `submitVoiceQuery(transcript)`, verify `vscode.postMessage` was called with `{ type: 'query', text: transcript }`
    - _Requirements: 4.3_

- [x] 8. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests use fast-check (JS) and Hypothesis (Python) with a minimum of 100 iterations each
- The ElevenLabs `onended` callback is the single point responsible for restarting the voice listen cycle — no other code path should call `listenForWakeWord()` after a voice query
