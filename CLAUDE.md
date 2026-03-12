# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Application

This is a **single-file application** with no build tooling, package manager, or test suite.

- **Open directly**: Load `index.html` in a browser
- **Serve locally**: `python -m http.server` or `npx serve .` from the project root

There are no install steps, build commands, lint commands, or test commands.

## Architecture Overview

The entire application lives in `index.html` (~7000+ lines). It is a **visual node-based AI workflow editor** built with vanilla JavaScript, HTML, and CSS — no frameworks or bundlers.

### File Structure in index.html

The file has two main sections:

1. **Lines 1–561 (before `<head>`)**: Host-injected infrastructure scripts (Firebase config bootstrap, html-to-image library, fetch interceptor that proxies Gemini API calls to the parent frame, getUserMedia proxy, console/error bridge). These are Google/Bard hosting platform scripts — not application logic.

2. **Lines 562+**: Application code — `<head>` CSS, `<body>` HTML, and `<script>` application logic.

### Core Data Structures

- `nodes[]` — Array of node objects: `{ id, type, el (DOM element), data (config), outputBuffer, internalState }`
- `connections[]` — Array of connection objects: `{ id, fromNodeId, fromPort, toNodeId, toPort, el (SVG path) }`
- Canvas state: `panZoom = { x, y, scale }` applied as CSS transform on `#canvas-wrapper`

### Node Type System

All node types are defined in `NODE_DEFINITIONS` (around line 1272), a plain object keyed by type string. Each entry has:
- `category`, `title`, `icon` (Material Symbol name)
- `content(node)` — returns inner HTML string for the node body
- `inputs[]` / `outputs[]` — typed port declarations

Node categories: **Inputs/Media** (`text-input`, `file-upload`, `webcam-capture`, `audio-recorder`, `drawing-canvas`), **User Interaction** (`chat-terminal`, `chat-interface`), **AI/Logic** (`system-prompt`, `llm-call`, `ai-evaluator`, `image-gen`, `history-manager`), **Logic** (`conditional-logic`, `stop-signal`), **Text Processing** (`summarization`, `sentiment-analysis`, `text-classification`), **Integrations** (`web-request`, `web-search`), **Utilities** (`string-formatter`, `math-operation`), **Data Processing** (`json-parser`, `json-extractor`, `code-runner`), **Output** (`display-value`).

### Execution Engine

1. `getExecutionOrder()` — Topological sort (DFS). Special cases: `history-manager` incoming edges are skipped (allows state cycles); `chat-terminal`/`chat-interface` outgoing edges are skipped (allows them to be downstream).
2. `executeFlowCycle()` — Iterates execution order, collects inputs from `outputBuffer`s, calls `executeNode()` for each. Returns `CYCLE_RESULT.SUCCESS`, `CYCLE_RESULT.ERROR`, or `CYCLE_RESULT.PAUSED_FOR_INPUT`.
3. `executeNode(nodeId, inputData)` — Large `switch` statement dispatching to node-specific logic.
4. `runAutonomousLoop()` — Wraps `executeFlowCycle()` in a `while` loop with configurable max cycles; controlled by `stopAutonomousExecution` flag.

### Gemini API Integration

- `getLLMConfig(nodeSpecificModel)` — Resolves API key + model URL (node override > global default > env fallback)
- `callGeminiAPI(prompt, jsonSchema, modelOverride)` — Reusable helper used by most AI nodes
- `llm-call` node makes its own direct `fetch` to support multimodal content (text + inline images + conversation history)
- Default model: `gemini-2.5-flash-preview-05-20`; also supports `gemini-1.5-pro-latest`, `gemini-2.5-pro`
- When running in the Bard/Google host, the fetch interceptor proxies Gemini API calls to the parent frame (no API key needed)

### Firebase Integration

- Firestore path: `artifacts/{appId}/users/{userId}/flows/{flowName}`
- Auth: custom token from `window.__initial_auth_token`, falls back to anonymous sign-in
- `serializeFlow()` / `loadFlow(flowDefinition, flowName)` — serialize/deserialize canvas state

### AI Flow Assistant

- Floating action button (bottom-right) opens a Gemini-powered chat for building flows via natural language
- Uses Gemini function calling: the `update_canvas` tool; `applyCanvasChanges(args)` applies the result
- System prompt includes all `NODE_DEFINITIONS` and current canvas state

### Predefined Example Flows

`MODULES` object (around line 2460) defines 8 example flows including `reflection-agent-loop` (loaded by default on startup), `autonomous-agent-loop`, `pdf-q-and-a`, `interactive-web-gen`, etc.

### Key Functions

| Function | Purpose |
|---|---|
| `init()` | App entry point — Firebase init, loads default module |
| `createNode(type, x, y, data, id)` | Instantiates a node DOM element and registers it |
| `rebuildNodeIO(node)` | Creates input/output port elements |
| `executeFlowCycle()` | Runs one complete pass of the flow graph |
| `executeNode(nodeId, inputData)` | Dispatches execution for a single node |
| `runAutonomousLoop()` | Runs multiple flow cycles for agentic loops |
| `getExecutionOrder()` | Topological sort with cycle-handling heuristics |
| `callGeminiAPI(prompt, schema, model)` | Reusable Gemini API call helper |
| `applyCanvasChanges(args)` | AI assistant applies canvas modifications |
| `renderDisplayValueContent(el, data)` | Renders text/HTML/Markdown/images/JSON in output nodes |
| `serializeFlow()` / `loadFlow()` | Firestore save/load |
| `showModalDialog(title, message, showInput)` | Custom modal replacing `window.prompt()` |

## Canvas Rendering

- Nodes are absolutely-positioned `<div class="node">` elements inside `#canvas-wrapper`
- Connections are SVG cubic Bezier curves in `<svg id="connections-layer">`
- Zoom range: 0.2x–2.5x; grid snap: 20px; default node width: 320px (CSS `--default-node-width`)
- All canvas transforms applied as CSS `transform: translate(x, y) scale(s)` on `#canvas-wrapper`
