# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Application

This is a **standalone static app** with no build tooling, package manager, or test suite.

- **Open directly**: Load `index.html` in a browser (ES modules require a server — file:// won't work)
- **Serve locally**: `python -m http.server` or `npx serve .` from the project root

There are no install steps, build commands, lint commands, or test commands.

## File Structure

```
ai-flow-visualizer/
├── index.html                 # Slim HTML shell (122 lines) — markup, CDN links, module entry
├── css/
│   └── styles.css             # All CSS (551 lines)
└── js/
    ├── main.js                # Entry point: init(), wires all event listeners
    ├── state.js               # DOM refs, constants, shared mutable state object
    ├── node-definitions.js    # NODE_DEFINITIONS object + createModelSelectorHTML
    ├── modules.js             # MODULES predefined flows, loadFlow, clearCanvas, loadModule
    ├── gemini-api.js          # getLLMConfig, callGeminiAPI
    ├── storage.js             # serializeFlow, localStorage save/load, file export/import
    ├── canvas.js              # updateTransform, pan/zoom/drag/drop, setupCanvasEventListeners
    ├── connections.js         # getPortCoords, drawConnection, updateAllConnections, CRUD
    ├── node-creation.js       # createNode, rebuildNodeIO, deleteNode, copyNodeOutput
    ├── node-initializers.js   # All initXxxNode functions, updateNode, runStringFormatter
    ├── node-execution.js      # executeNode switch dispatch + helpers
    ├── execution-engine.js    # getExecutionOrder, executeFlowCycle, startExecution, runAutonomousLoop
    ├── display.js             # renderDisplayValueContent, PDF rendering, extractTextFromPDF
    ├── ui.js                  # showToast, setStatus, showModalDialog, showSettingsModal, populateNodeLibrary
    └── assistant.js           # AI assistant: toggleChat, handleChatSubmit, applyCanvasChanges
```

## Architecture Overview

A **visual node-based AI workflow editor** built with vanilla JavaScript, HTML, and CSS — no frameworks or bundlers. The app uses ES modules (`<script type="module">`).

### State Management

All shared state lives in `js/state.js`, which has three kinds of exports:

- **DOM refs** — `export const canvas = document.getElementById('node-canvas')` (safe at module scope because ES modules defer execution)
- **Constants** — `GRID_SIZE`, `CYCLE_RESULT`, `STATEFUL_NODE_TYPES`, `CYCLE_BREAKER_TYPES`, `GEMINI_MODELS`, etc.
- **Mutable state** — a single `export const state = { nodes, connections, panZoom, isExecuting, ... }` object mutated in place by all modules

### Module Dependency Graph

```
state.js              ← no imports (leaf)
node-definitions.js   ← state.js
ui.js                 ← state.js, node-definitions.js
display.js            ← state.js
connections.js        ← state.js, ui.js
canvas.js             ← state.js, connections.js
gemini-api.js         ← state.js
node-creation.js      ← state.js, node-definitions.js, connections.js, node-initializers.js
node-initializers.js  ← state.js, connections.js, node-creation.js, ui.js
node-execution.js     ← state.js, gemini-api.js, display.js, ui.js, node-initializers.js
execution-engine.js   ← state.js, node-execution.js, ui.js
modules.js            ← state.js, node-creation.js, connections.js, canvas.js, ui.js
storage.js            ← state.js, ui.js, modules.js
assistant.js          ← state.js, node-definitions.js, node-creation.js, connections.js, gemini-api.js
main.js               ← imports from all modules, wires event listeners
```

The circular import between `node-creation.js` ↔ `node-initializers.js` ↔ `execution-engine.js` ↔ `node-execution.js` is safe — all cross-references are inside function bodies, never at module evaluation time.

### Core Data Structures

- `state.nodes[]` — Array of node objects: `{ id, type, el (DOM element), data (config), outputBuffer, internalState }`
- `state.connections[]` — Array of connection objects: `{ id, fromNode, fromPortIndex, toNode, toPortIndex }`
- `state.panZoom` — `{ x, y, scale }` applied as CSS transform on `#canvas-wrapper`

### Node Type System

All node types are defined in `NODE_DEFINITIONS` in `js/node-definitions.js`, a plain object keyed by type string. Each entry has:
- `category`, `title`, `icon` (Material Symbol name)
- `content(node)` — returns inner HTML string for the node body
- `inputs[]` / `outputs[]` — typed port declarations

Node categories: **Inputs/Media** (`text-input`, `file-upload`, `webcam-capture`, `audio-recorder`, `drawing-canvas`), **User Interaction** (`chat-terminal`, `chat-interface`), **AI/Logic** (`system-prompt`, `llm-call`, `ai-evaluator`, `image-gen`, `history-manager`), **Logic** (`conditional-logic`, `stop-signal`), **Text Processing** (`summarization`, `sentiment-analysis`, `text-classification`), **Integrations** (`web-request`, `web-search`), **Utilities** (`string-formatter`, `math-operation`), **Data Processing** (`json-parser`, `json-extractor`, `code-runner`), **Output** (`display-value`).

### Execution Engine

1. `getExecutionOrder()` (`execution-engine.js`) — Topological sort (DFS). `STATEFUL_NODE_TYPES` (`history-manager`) incoming edges are skipped to allow state cycles; `CYCLE_BREAKER_TYPES` (`chat-terminal`, `chat-interface`) outgoing edges are skipped.
2. `executeFlowCycle()` — Iterates execution order, collects inputs from `outputBuffer`s, calls `executeNode()` for each. Returns `CYCLE_RESULT.SUCCESS`, `CYCLE_RESULT.ERROR`, or `CYCLE_RESULT.PAUSED_FOR_INPUT`.
3. `executeNode(nodeId, inputs)` (`node-execution.js`) — Large `switch` dispatching to node-specific logic.
4. `runAutonomousLoop()` — Wraps `executeFlowCycle()` in a `while` loop up to `state.maxAutonomousCycles`; halted by `state.stopAutonomousExecution`.

### Gemini API Integration

- `getLLMConfig(nodeSpecificModel)` (`gemini-api.js`) — Resolves API key + model URL (node override > global default > env fallback)
- `callGeminiAPI(prompt, jsonSchema, modelOverride)` — Reusable helper used by most AI nodes
- `llm-call` node makes its own direct `fetch` in `node-execution.js` to support multimodal content (text + inline images + conversation history)
- **Default model:** `gemini-3.1-flash-lite-preview` (see `DEFAULT_ENV_MODEL` in `state.js`)
- **Supported models:**
    - `gemini-3.1-flash-lite-preview` (Default)
    - `gemini-2.0-flash-lite`
    - `gemini-flash-lite-latest`
    - `gemini-flash-latest`
    - `gemini-2.5-flash-lite`
    - `gemini-2.0-flash`
    - `gemini-2.5-flash`
    - `gemini-3.1-pro-preview`
- API key and default model are set in the Settings modal and persisted to `localStorage`

### Storage

All persistence uses **localStorage + JSON file I/O** — no server or database required.

| Action | Mechanism |
|---|---|
| Save | Prompts for a name → `localStorage.setItem('aiflow_' + name, JSON.stringify(serializeFlow()))` |
| Load | Lists `aiflow_*` keys in a modal → `loadFlow(parsed)` |
| Export | `serializeFlow()` → Blob → temporary `<a>` download link → `.json` file |
| Import | `<input type="file" accept=".json">` → FileReader → `loadFlow(parsed)` |
| Settings | API key → `aiflow_settings_apiKey`; model → `aiflow_settings_defaultModel` |

### AI Flow Assistant

- Floating action button (bottom-right) opens a Gemini-powered chat for building flows via natural language
- Uses Gemini function calling: the `update_canvas` tool; `applyCanvasChanges(args)` applies the result
- System prompt includes all `NODE_DEFINITIONS` and current canvas state

### Predefined Example Flows

`MODULES` object in `js/modules.js` defines 8 example flows:
- `reflection-agent-loop` — loaded by default on startup
- `autonomous-agent-loop`, `interactive-web-gen`, `sentiment-analysis-example`
- `pdf-q-and-a`, `visual-storyteller-combined`, `api-data-processing`, `blank`

### Key Functions

| Function | File | Purpose |
|---|---|---|
| `init()` | `main.js` | App entry point — restores settings, loads default module, wires events |
| `createNode(type, x, y, data, id)` | `node-creation.js` | Instantiates a node DOM element and registers it |
| `rebuildNodeIO(node)` | `node-creation.js` | Creates input/output port elements |
| `executeFlowCycle()` | `execution-engine.js` | Runs one complete pass of the flow graph |
| `executeNode(nodeId, inputs)` | `node-execution.js` | Dispatches execution for a single node |
| `runAutonomousLoop()` | `execution-engine.js` | Runs multiple flow cycles for agentic loops |
| `getExecutionOrder()` | `execution-engine.js` | Topological sort with cycle-handling heuristics |
| `callGeminiAPI(prompt, schema, model)` | `gemini-api.js` | Reusable Gemini API call helper |
| `applyCanvasChanges(args)` | `assistant.js` | AI assistant applies canvas modifications |
| `renderDisplayValueContent(el, data)` | `display.js` | Renders text/HTML/Markdown/images/JSON in output nodes |
| `serializeFlow()` / `loadFlow()` | `storage.js` / `modules.js` | Serialize/deserialize canvas state |
| `showModalDialog(title, message, showInput)` | `ui.js` | Custom modal replacing `window.prompt()` |
| `setupCanvasEventListeners()` | `canvas.js` | Wires pan/zoom/drag/drop on the canvas |

## Canvas Rendering

- Nodes are absolutely-positioned `<div class="node">` elements inside `#canvas-wrapper`
- Connections are SVG cubic Bezier curves in `<svg id="connections-layer">`
- Zoom range: 0.2x–2.5x; grid snap: 20px; default node width: 320px (CSS `--default-node-width`)
- All canvas transforms applied as CSS `transform: translate(x, y) scale(s)` on `#canvas-wrapper`

## CDN Dependencies

- **Marked.js** — Markdown rendering in display-value nodes
- **PDF.js 3.11.174** — PDF parsing and rendering
- **Google Fonts** — Roboto, Roboto Mono
- **Material Symbols Outlined** — Node and toolbar icons
