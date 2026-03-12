# AI Flow Visualizer

A visual node-based AI workflow editor built with vanilla JavaScript, HTML, and CSS. Build, connect, and run Gemini-powered AI pipelines entirely in the browser — no installation, no build step, no server required.

![AI Flow Visualizer](https://img.shields.io/badge/vanilla-JS-yellow) ![No dependencies](https://img.shields.io/badge/dependencies-CDN%20only-blue) ![Gemini API](https://img.shields.io/badge/API-Google%20Gemini-orange)

## Features

- **Visual canvas** — drag-and-drop nodes, pan, zoom, snap-to-grid
- **23 node types** across 8 categories (inputs, AI, logic, text processing, data, integrations, utilities, output)
- **Gemini API integration** — LLM calls, image generation (Imagen), sentiment analysis, summarization, JSON extraction, and more
- **Autonomous loop** — run multi-cycle agentic flows with configurable iteration limits
- **AI Flow Assistant** — floating chat UI that builds and modifies flows via natural language (Gemini function calling)
- **8 example flows** — reflection agent, autonomous loop, PDF Q&A, sentiment analysis, webpage generator, and more
- **Save / load / export / import** — localStorage persistence + JSON file I/O

## Getting Started

### Prerequisites

- A [Google Gemini API key](https://aistudio.google.com/app/apikey) (free tier available)
- Any local HTTP server (ES modules don't work over `file://`)

### Run Locally

```bash
# Option 1 — Python
python -m http.server

# Option 2 — Node.js
npx serve .
```

Then open `http://localhost:8000` (or whatever port is shown) in your browser.

### Configure API Key

1. Click the **Settings** (gear icon) button in the toolbar
2. Paste your Gemini API key
3. Optionally select a default model

Settings are saved to `localStorage` automatically.

## Node Types

| Category | Nodes |
|---|---|
| **Inputs / Media** | Text Input, File Upload, Webcam Capture, Audio Recorder, Drawing Canvas |
| **User Interaction** | Chat Terminal (modal pause), Chat Interface (inline auto-run) |
| **AI / Logic** | LLM Call, System Prompt, AI Evaluator (Pass/Fail), Image Gen (Imagen), History Manager |
| **Logic** | Conditional (If/Else), Stop Signal |
| **Text Processing** | Summarization, Sentiment Analysis, Text Classification |
| **Integrations** | Web Request (API), Web Search (simulated via LLM) |
| **Utilities** | String Formatter, Math Operation |
| **Data Processing** | JSON Parser, JSON Extractor (AI), Code Runner (JS) |
| **Output** | Display Value (text/Markdown/HTML/image/audio/PDF/JSON) |

## Example Flows

| Flow | Description |
|---|---|
| **Reflection Agent** *(default)* | LLM self-corrects output using an AI Evaluator in a loop |
| **Autonomous Agent Loop** | LLM + History Manager feedback loop |
| **Interactive Webpage Generator** | Prompt → LLM → sandboxed HTML preview |
| **Sentiment Analysis** | Text → Sentiment node → Display |
| **PDF Q&A** | Upload a PDF, ask questions, get answers |
| **Visual Storyteller** | Text + Imagen → combined story with image |
| **API Data Processing** | Web Request → JSON Parser → Code Runner → Display |
| **Blank Canvas** | Start from scratch |

## Usage

### Building a Flow

1. **Drag** a node from the left sidebar onto the canvas
2. **Connect** nodes by dragging from an output port (right side) to an input port (left side)
3. **Configure** nodes using the controls inside each node
4. **Run** the flow with the **Run Flow** button

### Autonomous Mode

Enable the **Autonomous** checkbox and set a cycle count to run the flow in a loop. Use a **Stop Signal** node or the AI Evaluator's PASS output to terminate the loop early.

### AI Assistant

Click the sparkle button (bottom-right of the canvas) to open the AI Flow Assistant. Describe what you want to build in plain English — the assistant will create or modify nodes and connections for you.

### Saving Your Work

| Action | How |
|---|---|
| Save to browser | **Save** button → enter a name |
| Load from browser | **Load** button → pick from list |
| Export as file | **Export** button → downloads `.json` |
| Import from file | **Import** button → select a `.json` file |

## Supported Gemini Models

| Model ID | Display Name |
|---|---|
| `gemini-3.1-flash-lite-preview` | Gemini 3.1 Flash Lite (Preview) — **Default** |
| `gemini-2.5-flash` | Gemini 2.5 Flash |
| `gemini-2.5-flash-lite` | Gemini 2.5 Flash Lite |
| `gemini-2.0-flash` | Gemini 2.0 Flash |
| `gemini-2.0-flash-lite` | Gemini 2.0 Flash Lite |
| `gemini-3.1-pro-preview` | Gemini 3.1 Pro (Preview) |

Image generation uses the hardcoded `imagen-3.0-generate-002` model.

## File Structure

```
ai-flow-visualizer/
├── index.html                 # HTML shell — markup, CDN links, module entry
├── css/
│   └── styles.css             # All CSS
└── js/
    ├── main.js                # Entry point — init(), event listeners
    ├── state.js               # DOM refs, constants, shared mutable state
    ├── node-definitions.js    # NODE_DEFINITIONS (all 23 node types)
    ├── node-creation.js       # createNode, rebuildNodeIO, deleteNode
    ├── node-initializers.js   # Per-node init functions, data binding
    ├── node-execution.js      # executeNode switch dispatch
    ├── execution-engine.js    # Topological sort, executeFlowCycle, autonomous loop
    ├── connections.js         # SVG Bezier connections, CRUD
    ├── canvas.js              # Pan, zoom, drag, drop
    ├── gemini-api.js          # getLLMConfig, callGeminiAPI
    ├── display.js             # renderDisplayValueContent, PDF rendering
    ├── modules.js             # 8 predefined example flows, loadFlow
    ├── storage.js             # serializeFlow, localStorage, file export/import
    ├── ui.js                  # Toast, status bar, modals, node library
    └── assistant.js           # AI Flow Assistant chat
```

## Technical Details

- **No build tooling** — vanilla ES modules (`<script type="module">`)
- **No frameworks** — pure DOM manipulation
- **State** — single shared `state` object in `state.js`, mutated in place
- **CDN dependencies** — Marked.js (Markdown), PDF.js 3.11.174 (PDF), Google Fonts, Material Symbols
- **Connections** — SVG cubic Bezier curves rendered inside the canvas transform
- **Execution** — topological sort (DFS) with special handling for stateful nodes (History Manager) and cycle-breaker nodes (Chat Terminal, Chat Interface)

## License

MIT
