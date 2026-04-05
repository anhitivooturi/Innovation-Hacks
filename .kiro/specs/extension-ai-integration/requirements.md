# Requirements Document

## Introduction

The DevLog AI VS Code extension currently has placeholder/dummy implementations for its AI-powered features. This feature replaces those stubs with real integrations: Google Vertex AI (Gemini) for diagram generation and text conversations, and ElevenLabs for voice conversation. The goal is to make the extension fully functional for a hackathon demo, where all three AI capabilities work end-to-end from within VS Code.

The extension communicates with a FastAPI backend (`server/`) that already has partial Vertex AI wiring via `vertexai` SDK. The extension's webview panels (`panel.js`, `sidebarProvider.js`) send messages to the extension host, which POSTs to the backend. Voice conversation is handled client-side in the webview using ElevenLabs' browser SDK or REST API.

## Glossary

- **Extension**: The VS Code extension located in `extension/src/`.
- **Backend**: The FastAPI server located in `server/app/`, running at a configurable base URL.
- **DevLogBrain**: The Python class in `server/app/llm.py` that wraps Vertex AI calls.
- **Panel**: The main webview panel (`extension/src/panel.js`) that renders diagrams, file breakdowns, and the query interface.
- **Sidebar**: The activity-bar webview (`extension/src/sidebarProvider.js`) showing project status and quick actions.
- **Vertex_AI**: Google Vertex AI service accessed via the `vertexai` Python SDK or `google.genai` SDK, using the project `project-5f6bf043-2561-48a7-af4` in `us-central1`.
- **Gemini_Model**: The best available Gemini model on Vertex AI — `gemini-2.5-pro` preferred, falling back to `gemini-2.5-flash`.
- **ElevenLabs**: The ElevenLabs text-to-speech and conversational AI service, accessed via REST API from the webview.
- **Voice_Assistant**: The in-Panel voice interface that listens for a wake word, sends the spoken query to the Backend, and reads the answer aloud using ElevenLabs TTS.
- **Diagram_Endpoint**: The `/diagram` POST endpoint on the Backend that returns a `DiagramResponse` with a `mermaid` string.
- **Query_Endpoint**: The `/query` POST endpoint on the Backend that returns a `QueryResponse` with an `answer` string.
- **Context_Harvester**: `extension/src/contextHarvester.js` — periodically collects workspace file tree, diagnostics, and git log and POSTs to `/context`.
- **CSP**: Content Security Policy applied to VS Code webviews, which restricts what scripts and network calls are allowed.

---

## Requirements

### Requirement 1: Diagram Generation via Vertex AI

**User Story:** As a developer, I want to click a diagram button in the Panel and receive a real AI-generated Mermaid diagram, so that I can visually understand my codebase without leaving VS Code.

#### Acceptance Criteria

1. WHEN a user clicks a diagram button in the Panel, THE Panel SHALL send a `generateDiagram` message to the Extension with the selected `kind` and the active file path.
2. WHEN the Extension receives a `generateDiagram` message, THE Extension SHALL POST to the Backend `/diagram` endpoint with `{ kind, filePath, projectId }`.
3. WHEN the Backend `/diagram` endpoint is called, THE DevLogBrain SHALL generate the Mermaid diagram using the Gemini_Model on Vertex_AI.
4. WHEN Vertex_AI returns a diagram response, THE Backend SHALL return a `DiagramResponse` containing a valid Mermaid string in the `mermaid` field.
5. IF Vertex_AI is unavailable or returns an error, THEN THE DevLogBrain SHALL fall back to the static analyzer output from `RepoAnalyzer.generate_diagram()` and return it without error.
6. WHEN the Panel receives a `result` message with a `mermaid` field, THE Panel SHALL render the diagram using the Mermaid.js library already loaded in the webview.
7. THE Gemini_Model used for diagram generation SHALL be `gemini-2.5-pro` if available in the configured Vertex_AI project, otherwise `gemini-2.5-flash`.

### Requirement 2: Text Conversation via Vertex AI

**User Story:** As a developer, I want to type a question about my codebase in the Panel or Sidebar and receive a real AI-generated answer, so that I can get contextual help without switching tools.

#### Acceptance Criteria

1. WHEN a user submits a question via the Panel query input or the Sidebar query box, THE Extension SHALL POST to the Backend `/query` endpoint with `{ projectId, question }`.
2. WHEN the Backend `/query` endpoint is called, THE DevLogBrain SHALL answer the question using the Gemini_Model on Vertex_AI, grounded in the current `ProjectState` markdown and timeline.
3. WHEN Vertex_AI returns an answer, THE Backend SHALL return a `QueryResponse` with the answer text in the `answer` field.
4. IF Vertex_AI is unavailable or returns an error, THEN THE DevLogBrain SHALL fall back to the keyword-based `_fallback_query()` method and return a result without surfacing a 500 error to the Extension.
5. WHEN the Panel receives a `queryResult` message, THE Panel SHALL display the answer in the answer box and, if auto-speak is enabled, read it aloud.
6. WHEN the Sidebar receives a query response, THE Sidebar SHALL display the answer in the VS Code information message and log it to the output channel.
7. THE Gemini_Model used for text conversation SHALL be `gemini-2.5-pro` if available, otherwise `gemini-2.5-flash`.
8. WHEN the Backend processes a query, THE DevLogBrain SHALL include the most recent 12 timeline events and the full project markdown as context in the Vertex_AI prompt.

### Requirement 3: Model Selection — Best Available Gemini on Vertex AI

**User Story:** As a developer, I want the extension to automatically use the best available Gemini model, so that I get the highest quality responses without manual configuration.

#### Acceptance Criteria

1. THE Backend SHALL attempt to initialize the Gemini_Model as `gemini-2.5-pro` first when Vertex_AI is enabled.
2. IF `gemini-2.5-pro` is not available in the configured Vertex_AI project, THEN THE Backend SHALL fall back to `gemini-2.5-flash` without requiring user intervention.
3. THE Backend config (`server/app/config.py`) SHALL read the model name from the `DEVLOG_GEMINI_MODEL` environment variable, defaulting to `gemini-2.5-pro`.
4. WHEN the Backend starts up, THE DevLogBrain SHALL log the active model name to stdout so operators can confirm which model is in use.
5. IF neither `gemini-2.5-pro` nor `gemini-2.5-flash` is reachable, THEN THE DevLogBrain SHALL operate in fallback-only mode and log a warning at startup.

### Requirement 4: ElevenLabs Voice Conversation

**User Story:** As a developer, I want to speak a question to the Voice_Assistant and hear the answer read back in a natural voice using ElevenLabs, so that I can interact with my codebase hands-free during a demo.

#### Acceptance Criteria

1. WHEN the Voice_Assistant toggle is enabled in the Panel, THE Panel SHALL begin listening for the wake phrase "Hey DevLog" using the browser Web Speech API.
2. WHEN the wake phrase is detected, THE Panel SHALL prompt the user to speak their question and capture the spoken text via the Web Speech API.
3. WHEN a spoken question is captured, THE Panel SHALL POST the question to the Backend `/query` endpoint via the Extension message-passing channel (same as text queries).
4. WHEN the Backend returns an answer, THE Panel SHALL send the answer text to the ElevenLabs TTS REST API using the configured ElevenLabs API key and voice ID.
5. WHEN ElevenLabs returns audio data, THE Panel SHALL play the audio in the webview using the Web Audio API or an `<audio>` element.
6. IF the ElevenLabs API key is not configured, THEN THE Panel SHALL fall back to the browser's built-in `SpeechSynthesis` API for TTS and display a notice that ElevenLabs is not configured.
7. IF the ElevenLabs API call fails, THEN THE Panel SHALL fall back to `SpeechSynthesis` for that response and log the error to the VS Code output channel via the Extension.
8. THE Panel SHALL read the ElevenLabs API key from a VS Code configuration setting `devlog.elevenLabsApiKey` (type: string, default: empty).
9. THE Panel SHALL read the ElevenLabs voice ID from a VS Code configuration setting `devlog.elevenLabsVoiceId` (type: string, default: `"21m00Tcm4TlvDq8ikWAM"` — the Rachel voice).
10. WHEN the Voice_Assistant is active and playing audio, THE Panel SHALL display a visual indicator (animated mic dot) showing the speaking state.
11. WHILE the Voice_Assistant is speaking a response, THE Panel SHALL not start a new listening cycle until the audio playback completes.

### Requirement 5: Extension Configuration for AI Services

**User Story:** As a developer, I want to configure AI service credentials in VS Code settings, so that I can connect the extension to the correct Vertex AI project and ElevenLabs account without editing source files.

#### Acceptance Criteria

1. THE Extension SHALL expose a VS Code configuration setting `devlog.elevenLabsApiKey` of type string for the ElevenLabs API key.
2. THE Extension SHALL expose a VS Code configuration setting `devlog.elevenLabsVoiceId` of type string for the ElevenLabs voice ID, defaulting to `"21m00Tcm4TlvDq8ikWAM"`.
3. THE Extension SHALL pass the `devlog.elevenLabsApiKey` and `devlog.elevenLabsVoiceId` values to the Panel webview via the initial HTML or a dedicated `configure` message when the Panel opens.
4. THE Backend SHALL read Vertex_AI credentials from the environment (`DEVLOG_USE_VERTEX`, `DEVLOG_GOOGLE_CLOUD_PROJECT`, `DEVLOG_GCP_LOCATION`, `DEVLOG_GEMINI_MODEL`) as already defined in `server/app/config.py`.
5. IF `devlog.apiBaseUrl` is changed in VS Code settings, THE Extension SHALL use the new URL for all subsequent Backend requests without requiring a reload.

### Requirement 6: Backend `/diagram` Endpoint — AI-Enhanced Output

**User Story:** As a developer, I want the diagram endpoint to produce AI-enriched Mermaid diagrams with explanations, so that the diagrams are more informative than static analysis alone.

#### Acceptance Criteria

1. WHEN the Backend `/diagram` endpoint is called with `kind` and optional `filePath`, THE DevLogBrain SHALL build a prompt that includes the static analyzer's base Mermaid output and the file's content.
2. WHEN Vertex_AI returns an enhanced diagram, THE Backend SHALL validate that the response contains a `mermaid` key before returning it to the Extension.
3. IF the Vertex_AI response does not contain a valid `mermaid` key, THEN THE Backend SHALL return the static analyzer's original output as the `DiagramResponse`.
4. THE Backend `/diagram` endpoint SHALL respond within 30 seconds; IF the Vertex_AI call exceeds this timeout, THEN THE Backend SHALL return the static analyzer fallback.
5. THE `DiagramResponse` returned by the Backend SHALL always include a non-empty `mermaid` string, a `title`, an `explanation`, and a `kind` field.

### Requirement 7: Webview CSP Compliance for ElevenLabs

**User Story:** As a developer, I want the Panel webview to be able to call the ElevenLabs API without CSP violations, so that voice responses work reliably inside VS Code.

#### Acceptance Criteria

1. THE Panel webview CSP `connect-src` directive SHALL include `https://api.elevenlabs.io` to allow ElevenLabs REST API calls.
2. THE Panel webview CSP `media-src` directive SHALL include `blob:` to allow playback of audio blobs returned by ElevenLabs.
3. WHEN the Panel HTML is generated, THE Extension SHALL include a nonce in all inline `<script>` tags and reference the nonce in the CSP `script-src` directive.
4. THE Panel webview SHALL NOT load any external scripts except `https://cdn.jsdelivr.net` (Mermaid.js), which is already allowed.
