# AI Flow Visualizer — Internal Documentation

This document describes the inner workings of the AI Flow Visualizer, focusing on Gemini API integration, Firebase integration, and all external network calls. The entire application lives in a single `index.html` file (~4500 lines).

---

## 1. Architecture Overview

The file has two distinct layers. **Lines 1–561** contain host-injected infrastructure scripts prepended by the Google/Bard embedding platform — these are not application logic. **Lines 562+** contain the actual application: CSS, HTML, and vanilla JavaScript (ES Modules for Firebase, inline `<script>` for everything else).

The app runs inside an iframe. The host scripts intercept browser APIs (`fetch`, `getUserMedia`, `console`, `SpeechRecognition`) to proxy requests through the parent frame, gate permissions, and forward telemetry.

```mermaid
graph TB
    subgraph Host["Host-Injected Scripts (lines 1–561)"]
        S1["1. Firebase Config Bootstrap<br/>(lines 2–6)<br/>Injects __firebase_config,<br/>__initial_auth_token, __app_id"]
        S2["2. html-to-image Library<br/>(lines 7–61)<br/>Screenshot capture for parent"]
        S3["3. Firebase Auth Bridge<br/>(lines 62–108)<br/>requestNewFirebaseToken()"]
        S4["4. getUserMedia / SpeechRecognition<br/>Interceptors (lines 109–243)<br/>Permission gate via parent"]
        S5["5. Fetch Interceptor<br/>(lines 244–427)<br/>Proxies Gemini API calls<br/>when no API key present"]
        S6["6. Interaction Reporter<br/>(line 428)<br/>Heartbeat on click/touch/keydown"]
        S7["7. Console/Error Bridge<br/>(lines 429–560)<br/>Forwards logs and errors<br/>to parent frame"]
    end

    subgraph App["Application Code (lines 562+)"]
        A1["CSS Styles"]
        A2["HTML Structure<br/>(toolbar, canvas, dialogs)"]
        A3["Application JavaScript<br/>(NODE_DEFINITIONS, execution engine,<br/>Gemini calls, Firebase save/load)"]
    end

    S1 -- "config + JWT + appId" --> A3
    S3 -. "token refresh (available but unused)" .-> A3
    S5 -- "transparent fetch proxy" --> A3
```

---

## 2. Gemini API Integration

### 2.1 API Key and Model Resolution

All Gemini API calls route through `getLLMConfig()` (line ~3208), which resolves the model and API key using this priority chain:

1. **Node-level model override** (`node.data.model`) — set via per-node `<select>` dropdown (only on `llm-call` and `ai-evaluator` nodes)
2. **Global default model** (`globalDefaultModel`) — set in the LLM Settings dialog
3. **Environment fallback** — `gemini-2.5-flash-preview-05-20` (hardcoded as `DEFAULT_ENV_MODEL`)

When no user API key is set (`userGeminiApiKey` is empty), any non-default model override is silently ignored and the model is forced to `DEFAULT_ENV_MODEL`. The resulting `fetch` call has an empty `?key=` param, which causes the fetch interceptor to proxy it to the parent frame.

Available models (configurable in Settings dialog with a user-provided API key):

| Model ID                         | Display Name               |
| -------------------------------- | -------------------------- |
| `gemini-2.5-flash-preview-05-20` | Gemini 2.5 Flash (Default) |
| `gemini-1.5-pro-latest`          | Gemini 1.5 Pro             |
| `gemini-2.5-pro`                 | Gemini 2.5 Pro             |

`getLLMConfig()` returns:
```js
{ apiKey: string, modelId: string, url: "https://generativelanguage.googleapis.com/v1beta/models/{modelId}:generateContent?key={apiKey}" }
```

### 2.2 `callGeminiAPI()` — Shared Helper

**Signature:** `callGeminiAPI(prompt, jsonSchema = null, modelOverride = null)`

This is the common entry point for most AI nodes. Key behaviors:

- Sends a **single-turn**, **non-streaming** request to `:generateContent`
- Payload: `{ contents: [{ role: "user", parts: [{ text: prompt }] }] }`
- When `jsonSchema` is provided, adds `generationConfig: { responseMimeType: "application/json", responseSchema: jsonSchema }` — the API returns JSON as a string inside `parts[0].text`, which the function parses with `JSON.parse()`
- Without a schema, returns the raw trimmed text from `candidates[0].content.parts[0].text`
- Throws on non-2xx HTTP responses

### 2.3 Per-Node Gemini Usage

| Node Type             | Call Method            | JSON Schema                                     | Model Override   | Purpose                                                                   |
| --------------------- | ---------------------- | ----------------------------------------------- | ---------------- | ------------------------------------------------------------------------- |
| `summarization`       | `callGeminiAPI`        | None                                            | Yes              | Concise text summary                                                      |
| `sentiment-analysis`  | `callGeminiAPI`        | `{ sentiment: STRING, score: NUMBER }`          | Yes              | Sentiment label + confidence                                              |
| `text-classification` | `callGeminiAPI`        | None                                            | Yes              | Single-label classification into user-defined categories                  |
| `json-extractor`      | `callGeminiAPI`        | User-defined (from node config)                 | Yes              | Structured data extraction from text                                      |
| `ai-evaluator`        | `callGeminiAPI`        | `{ verdict: "PASS"\|"FAIL", feedback: STRING }` | Yes              | Pass/fail judgment for autonomous loops                                   |
| `web-search`          | `callGeminiAPI`        | None                                            | Yes              | Simulated search — asks LLM to synthesize results (not a real web search) |
| `llm-call`            | Direct `fetch`         | None                                            | Yes              | Generic multimodal LLM call (text + images + PDF + history)               |
| `image-gen`           | Direct `fetch`         | N/A (Predict API)                               | No (hardcoded)   | Image generation via Imagen                                               |
| AI Flow Assistant     | Direct `fetch` + tools | Function calling                                | No (global only) | Builds/modifies flows via `update_canvas` tool                            |

### 2.4 LLM Call Node — Direct Multimodal Fetch

The `llm-call` node (line ~3831) bypasses `callGeminiAPI()` because it needs capabilities the shared helper doesn't support:

- **Multimodal content**: `inlineData` parts for images (webcam, file upload, drawing canvas) and audio
- **PDF support**: Extracts text via PDF.js before sending as a text part
- **Conversation history**: Formats history arrays from `history-manager` nodes as context text
- **System prompt**: Injected as a fake `user`/`model` exchange pair prepended to `contents[]` (not using the `systemInstruction` API field)
- **Structured chat input**: Handles `{ text, media }` objects from `chat-interface` nodes

The payload structure is standard `contents: [{ role, parts }]` but with multiple heterogeneous parts per turn.

### 2.5 Image Generation — Imagen API

The `image-gen` node (line ~3908) uses a completely different API format:

- **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key={apiKey}`
- **Model**: Hardcoded `imagen-3.0-generate-002` — does not use `getLLMConfig()` for the URL, only reads `userGeminiApiKey` directly
- **Payload** (Vertex/Predict style):
  ```json
  { "instances": [{ "prompt": "..." }], "parameters": { "sampleCount": 1 } }
  ```
- **Response**: `predictions[0].bytesBase64Encoded` → returned as `data:image/png;base64,...` data URL
- The fetch interceptor covers this URL (listed in `deprecatedImageModelNames` whitelist), so it is proxied when no API key is set

### 2.6 AI Flow Assistant — Function Calling

The floating action button (bottom-right) opens a Gemini-powered chat that can build and modify flows programmatically.

- Uses `getLLMConfig()` with no arguments — always uses the global default model
- **Multi-turn**: Maintains a `chatHistory[]` array that accumulates across the session
- Uses the `systemInstruction` API field (unlike the `llm-call` node) with a prompt that includes:
  - All `NODE_DEFINITIONS` serialized with their data schemas
  - Current canvas state from `getCanvasState()` (all nodes and connections)
  - Layout rules (left-to-right, 350px spacing, autonomous loop patterns)
- **Tool declaration**:
  ```json
  { "functionDeclarations": [{ "name": "update_canvas", "parameters": {
      "clear_first": "BOOLEAN",
      "nodes_to_create": [{ "id", "type", "x", "y", "data" }],
      "nodes_to_update": [{ "id", "data" }],
      "connections_to_create": [{ "from_node_id", "from_port_index", "to_node_id", "to_port_index" }]
  }}]}
  ```
- When the response contains `part.functionCall.name === "update_canvas"`, `applyCanvasChanges(args)` is called, which:
  1. Optionally clears the canvas (`clear_first`)
  2. Creates nodes, mapping temporary IDs to real IDs via `idMap`
  3. Updates existing nodes' data
  4. Creates connections using the ID map for newly-created nodes

### Gemini Call Routing Diagram

```mermaid
flowchart TD
    A["Node execution or<br/>Assistant chat triggers API call"] --> B{Which caller?}

    B -->|"summarization, sentiment-analysis,<br/>text-classification, json-extractor,<br/>ai-evaluator, web-search"| C["callGeminiAPI(prompt, schema?, modelOverride?)"]
    B -->|"llm-call node"| D["Direct fetch()<br/>Multimodal payload:<br/>text + inlineData + history"]
    B -->|"image-gen node"| E["Direct fetch()<br/>imagen-3.0-generate-002:predict<br/>Vertex-style payload"]
    B -->|"AI Flow Assistant"| F["Direct fetch()<br/>Function calling<br/>update_canvas tool + systemInstruction"]

    C --> G["getLLMConfig(modelOverride)"]
    D --> G
    F --> H["getLLMConfig()<br/>global default only"]

    G --> J["Constructs URL:<br/>generativelanguage.googleapis.com<br/>/v1beta/models/{model}:generateContent<br/>?key={apiKey}"]
    H --> J

    E --> K["Hardcoded URL:<br/>.../imagen-3.0-generate-002:predict<br/>?key={userGeminiApiKey}"]

    J --> L["fetch(url, options)"]
    K --> L

    L --> M{Fetch Interceptor:<br/>API key present?}

    M -->|"Yes (key in URL<br/>or header or body)"| N["Direct call to<br/>Google API servers"]
    M -->|"No key found"| O["Proxied via postMessage<br/>to parent frame"]

    N --> P["Parse response:<br/>candidates[0].content.parts[0].text<br/>or predictions[0].bytesBase64Encoded"]
    O --> Q["Parent calls API<br/>with its own credentials"] --> R["resolveFetch message<br/>reconstructs Response"] --> P
```

---

## 3. Fetch Interceptor (Host-Proxied API Calls)

### 3.1 Why It Exists

When the app runs inside the Google/Bard iframe without a user-provided API key, it cannot call Gemini APIs directly. The parent host has credentials. The fetch interceptor (lines 244–427) monkey-patches `window.fetch` so that qualifying API calls are transparently forwarded to the parent frame via `postMessage`. To the calling code, `await fetch(url)` behaves identically whether the request goes direct or is proxied.

### 3.2 URL Whitelist

The interceptor receives a `modelInformation` config object (injected at line 428) listing all model names. It builds a whitelist of URL prefixes covering:

| Category           | Model(s)                                                                                                                                       | Operations                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Text (active)      | `gemini-3-flash-preview`                                                                                                                       | `:streamGenerateContent`, `:generateContent` |
| Text (deprecated)  | `gemini-2.0-flash`, `gemini-2.5-flash`, `gemini-2.5-flash-preview-04-17`, `gemini-2.5-flash-preview-05-20`, `gemini-2.5-flash-preview-09-2025` | `:streamGenerateContent`, `:generateContent` |
| Image (active)     | `imagen-4.0-generate-001`                                                                                                                      | `:predict`, `:predictLongRunning`            |
| Image (deprecated) | `imagen-3.0-generate-001`, `imagen-3.0-generate-002`                                                                                           | `:predict`, `:predictLongRunning`            |
| Image edit         | `gemini-2.5-flash-image-preview`                                                                                                               | `:generateContent`                           |
| Image transform    | `gemini-3-pro-image-preview-11-2025`                                                                                                           | `:generateContent`                           |
| Video              | `veo-2.0-generate-001`                                                                                                                         | `:predict`, `:predictLongRunning`            |
| TTS                | `gemini-2.5-flash-preview-tts`                                                                                                                 | `:generateContent`                           |

All URLs are prefixed with `https://generativelanguage.googleapis.com/v1beta/models/`.

> **Note**: The app code uses `gemini-2.5-flash-preview-05-20` (listed under deprecated text models) and `imagen-3.0-generate-002` (listed under deprecated image models). The interceptor covers both.

### 3.3 API Key Detection

When a `fetch` URL matches the whitelist, the interceptor checks for an API key in three places (in order):

1. **URL query parameter**: `?key=...` — parsed from the URL string
2. **Request header**: `X-API-Key` or `x-api-key`
3. **Request body**: JSON field `apiKey` (only for POST/PUT/PATCH)

If any check finds a non-empty key, the request passes through to the original `fetch`. If all three fail, the request is proxied.

### 3.4 Proxy Mechanism

When proxying:
1. A unique `promiseId` is generated
2. The request is serialized: `{ url, modelName, options: { method, headers, body } }`
3. `window.parent.postMessage({ type: 'requestFetch', ... }, '*')` is sent
4. A pending `Promise` is returned to the caller
5. The parent frame makes the API call with its own credentials
6. The parent sends back `{ type: 'resolveFetch', promiseId, response: { body, status, statusText, headers } }`
7. The interceptor reconstructs a `Response` object and resolves the promise

`ReadableStream` bodies are serialized as `null` (streaming responses lose their body in the proxy).

```mermaid
flowchart TD
    A["window.fetch(url, options)"] --> B{URL matches<br/>Gemini/Imagen whitelist?}

    B -->|No| C["originalFetch(url, options)<br/>Direct network call"]
    B -->|Yes| D{"Check 1:<br/>?key= in URL?"}

    D -->|Key found| C
    D -->|No key| E{"Check 2:<br/>X-API-Key header?"}

    E -->|Key found| C
    E -->|No key| F{"Check 3:<br/>apiKey in POST body?"}

    F -->|Key found| C
    F -->|No key| G["PROXY: Generate promiseId"]

    G --> H["Store resolve callback<br/>in pendingFetchResolvers[promiseId]"]
    H --> I["window.parent.postMessage<br/>{ type: 'requestFetch',<br/>url, modelName,<br/>options, promiseId }"]
    I --> J["Return pending Promise<br/>to caller"]

    K["Parent frame receives request<br/>Calls API with own credentials"] --> L["Parent sends:<br/>{ type: 'resolveFetch',<br/>promiseId, response }"]
    L --> M["Reconstruct Response:<br/>new Response(body,<br/>{ status, statusText, headers })"]
    M --> N["Resolve pending Promise<br/>Caller's await completes"]
```

---

## 4. Firebase Integration

### 4.1 SDK and Config

Firebase SDK **v11.6.1** is loaded as ES modules from `https://www.gstatic.com/firebasejs/11.6.1/`. Three packages are imported:

| Package              | Symbols Used                                                                  |
| -------------------- | ----------------------------------------------------------------------------- |
| `firebase-app`       | `initializeApp`                                                               |
| `firebase-auth`      | `getAuth`, `signInAnonymously`, `signInWithCustomToken`, `onAuthStateChanged` |
| `firebase-firestore` | `getFirestore`, `doc`, `setDoc`, `getDocs`, `collection`, `serverTimestamp`   |

> `deleteDoc`, `getDoc`, `updateDoc`, and `Timestamp` are also imported but **never called** in the application code.

Configuration is injected by the host at lines 2–6 into three window globals:

| Global                        | Value                                                                                  | Purpose                |
| ----------------------------- | -------------------------------------------------------------------------------------- | ---------------------- |
| `window.__firebase_config`    | JSON string with `apiKey`, `authDomain`, `projectId`, etc. for project `bard-frontend` | Firebase app config    |
| `window.__initial_auth_token` | RS256 JWT signed by the `bard-frontend` service account                                | Custom auth token      |
| `window.__app_id`             | `"65563430d0ed-index.html-447"`                                                        | Firestore path segment |

If `__firebase_config` is null (e.g., running locally outside the host), Firebase is not initialized and the app enters **Local Mode** with Save/Load buttons permanently disabled.

### 4.2 Authentication Flow

`initializeFirebase()` (line ~1596):

1. `initializeApp(firebaseConfig)` → `getAuth(app)` → `getFirestore(app)`
2. Registers `onAuthStateChanged` listener — enables Save/Load buttons when authenticated, disables on sign-out
3. **Primary path**: `signInWithCustomToken(auth, __initial_auth_token)` — uses the host-provided JWT
4. **Fallback**: `signInAnonymously(auth)` — when no initial token is available
5. On success, `userId = user.uid` is stored for constructing Firestore document paths
6. On error, both buttons are disabled and status shows "Storage Error"

The host-injected `window.requestNewFirebaseToken()` function (lines 62–108) provides a `postMessage`-based token refresh mechanism, but it is **never called** by the application code — it exists as scaffolding for the host to push renewed tokens.

### 4.3 Firestore Data Model

**Collection path**: `artifacts/{appId}/users/{userId}/flows/{flowName}`

- `{appId}` — from `window.__app_id` (fallback: `'ai-flow-visualizer-v1'`)
- `{userId}` — Firebase Auth UID from `onAuthStateChanged`
- `{flowName}` — user-provided string, used as the document ID

**Document shape** (produced by `serializeFlow()` at line ~1643):

```json
{
  "nodes": [
    { "id": "node_llm-call_1718000000000_ab3fg", "type": "llm-call", "x": 400, "y": 200, "data": { "model": "gemini-1.5-pro-latest" } }
  ],
  "connections": [
    { "fromNode": "node_text-input_...", "fromPortIndex": 0, "toNode": "node_llm-call_...", "toPortIndex": 1 }
  ],
  "panZoom": { "x": 0, "y": 0, "scale": 1 },
  "createdAt": "<Firestore ServerTimestamp>"
}
```

Notable serialization details:
- `node.data` contents vary by node type (e.g., `text-input` stores `value`, `web-request` stores `url`/`method`/`headers`, `llm-call` stores `model`)
- `history-manager` internal state (`internalState.buffer`) is **not serialized** — history is lost on save/load
- `text-input` / `system-prompt` textarea values are read from the DOM at execution time, not always persisted in `node.data`

### 4.4 Save Flow

`saveFlow()` (line ~1738):

1. Guards on `userId && db` — shows error toast if not authenticated
2. Opens `showModalDialog()` with text input for the flow name
3. Calls `serializeFlow()` to capture current canvas state
4. `setDoc(doc(db, "artifacts", appId, "users", userId, "flows", flowName), flowData)`
5. Uses `setDoc` (not `addDoc`) — the flow name **is** the document ID, so saving with the same name silently **overwrites**

### 4.5 Load Flow

`showLoadFlowDialog()` (line ~1776):

1. Guards on `userId && db`
2. `getDocs(collection(...))` fetches **all** flow documents at once (no pagination, no Firestore `orderBy`)
3. Sorts by `createdAt` descending **in JavaScript** (avoids Firestore composite index requirement)
4. Renders a modal list showing flow name + formatted timestamp
5. On selection, calls `loadFlow(flowData, flowName)` which:
   - Clears the entire canvas
   - Recreates each node via `createNode(type, x, y, data, id)` — preserves original IDs
   - Recreates connections, resolving both Firestore format (`fromNode`/`toNode`) and built-in module format (`from`/`to`)
   - Restores `panZoom` camera state

There is **no delete or rename UI** for saved flows.

```mermaid
sequenceDiagram
    participant Host as Google/Bard Host
    participant App as Application (index.html)
    participant FBAuth as Firebase Auth
    participant FS as Cloud Firestore

    Note over Host,App: Initialization (page load)
    Host->>App: Inject __firebase_config, __initial_auth_token, __app_id
    App->>FBAuth: initializeApp(config)
    App->>FBAuth: getAuth() + getFirestore()

    alt Custom token available
        App->>FBAuth: signInWithCustomToken(token)
    else No token
        App->>FBAuth: signInAnonymously()
    end

    FBAuth-->>App: onAuthStateChanged(user)
    App->>App: userId = user.uid
    App->>App: Enable Save/Load buttons

    Note over App,FS: Save Flow
    App->>App: User clicks Save → modal prompt for name
    App->>App: serializeFlow() → {nodes, connections, panZoom, createdAt}
    App->>FS: setDoc(artifacts/{appId}/users/{userId}/flows/{name}, data)
    FS-->>App: Write confirmed → success toast

    Note over App,FS: Load Flow
    App->>FS: getDocs(artifacts/{appId}/users/{userId}/flows)
    FS-->>App: QuerySnapshot (all flow documents)
    App->>App: Sort by createdAt desc (client-side)
    App->>App: Render modal list of flows
    App->>App: User selects flow → loadFlow()
    App->>App: clearCanvas() → recreate nodes/connections → restore panZoom
```

---

## 5. All External Calls Reference

### 5.1 CDN Resources (Loaded at Page Parse Time)

| Resource           | URL                                                                                                                    | Version  | Purpose                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------- |
| Firebase App       | `https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js`                                                            | 11.6.1   | App initialization                                   |
| Firebase Auth      | `https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js`                                                           | 11.6.1   | Authentication                                       |
| Firebase Firestore | `https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js`                                                      | 11.6.1   | Database read/write                                  |
| Google Fonts       | `https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Mono&display=swap`                     | N/A      | UI typography (Roboto + Roboto Mono)                 |
| Material Symbols   | `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200` | N/A      | Icon font for node/toolbar icons                     |
| Marked.js          | `https://cdn.jsdelivr.net/npm/marked/marked.min.js`                                                                    | Latest   | Markdown rendering in Display Value node and AI chat |
| PDF.js             | `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js`                                                    | 3.11.174 | PDF text extraction and visual rendering             |
| PDF.js Worker      | `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`                                             | 3.11.174 | Off-main-thread PDF parsing                          |

### 5.2 Gemini / Imagen API Endpoints (Runtime)

| Endpoint Pattern                                                                  | Method | Callers                                               | Notes                                           |
| --------------------------------------------------------------------------------- | ------ | ----------------------------------------------------- | ----------------------------------------------- |
| `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`         | POST   | `callGeminiAPI()`, `llm-call` node, AI Flow Assistant | Non-streaming; all text/structured output calls |
| `generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict` | POST   | `image-gen` node                                      | Vertex-style payload; hardcoded model           |

Both endpoints are subject to the fetch interceptor — proxied via `postMessage` when no API key is present.

### 5.3 Web Request Node (User-Configured)

The `web-request` node makes arbitrary HTTP calls via `fetch(url, { method, headers, body })` where all parameters are user-supplied. These calls pass through the fetch interceptor but are **not intercepted** (they don't match the Gemini/Imagen URL whitelist). Supports GET, POST, PUT, DELETE methods with custom JSON headers and auto-detection of JSON vs text responses.

Example default URL in the "API Data Processing" module template: `https://jsonplaceholder.typicode.com/todos/1`

### 5.4 postMessage Protocol (Iframe ↔ Parent)

**Outbound messages (app → parent frame):**

| Message `type`                           | Sender Script            | Key Payload Fields                                                                              | Purpose                                               |
| ---------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `requestFetch`                           | Fetch interceptor        | `url`, `modelName`, `options` (method/headers/body), `promiseId`                                | Proxy Gemini/Imagen API call through host             |
| `REQUEST_NEW_FIREBASE_TOKEN`             | Firebase auth bridge     | `promiseId`                                                                                     | Request fresh Firebase auth token from host           |
| `requestMediaPermission`                 | getUserMedia interceptor | `constraints`, `promiseId`                                                                      | Gate camera/mic access through host permission dialog |
| `interaction`                            | Interaction reporter     | _(none)_                                                                                        | Activity heartbeat on every click, touch, or keydown  |
| `log`                                    | Console bridge           | `message`                                                                                       | Forward `console.log` output to host                  |
| `error`                                  | Console/error bridge     | `source` (CONSOLE_ERROR / global / unhandledrejection), `message`, `name`, `stack`, `timestamp` | Forward errors and unhandled rejections               |
| `SEND_SCREENSHOT`                        | html-to-image handler    | `image` (data URL), `topOffset`                                                                 | Respond to screenshot request                         |
| `SEND_SCREENSHOT_FOR_DATA_VISUALIZATION` | html-to-image handler    | `image` (data URL), `topOffset: 0`                                                              | Respond to data viz screenshot request                |

**Inbound messages (parent frame → app):**

| Message `type`                           | Handler Script           | Key Payload Fields                                       | Purpose                                       |
| ---------------------------------------- | ------------------------ | -------------------------------------------------------- | --------------------------------------------- |
| `resolveFetch`                           | Fetch interceptor        | `promiseId`, `response` (body/status/statusText/headers) | Return proxied API response                   |
| `RESOLVE_NEW_FIREBASE_TOKEN`             | Firebase auth bridge     | `promiseId`, `success`, `token`, `error`                 | Return refreshed Firebase auth token          |
| `resolveMediaPermission`                 | getUserMedia interceptor | `promiseId`, `granted`                                   | Return media permission decision              |
| `MAKE_SCREENSHOT`                        | html-to-image handler    | _(none)_                                                 | Trigger full-page screenshot capture          |
| `MAKE_SCREENSHOT_FOR_DATA_VISUALIZATION` | html-to-image handler    | _(none)_                                                 | Trigger data visualization screenshot capture |

```mermaid
graph LR
    subgraph Iframe["App Iframe (index.html)"]
        FI["Fetch Interceptor"]
        AB["Auth Bridge"]
        MI["Media Interceptor"]
        IR["Interaction Reporter"]
        CB["Console/Error Bridge"]
        SS["Screenshot Handler"]
    end

    subgraph Parent["Parent Frame (Google/Bard Host)"]
        PF["API Proxy"]
        PT["Token Provider"]
        PM["Permission Gate"]
        TM["Telemetry"]
        SC["Screenshot Consumer"]
    end

    FI -- "requestFetch" --> PF
    PF -- "resolveFetch" --> FI

    AB -- "REQUEST_NEW_FIREBASE_TOKEN" --> PT
    PT -- "RESOLVE_NEW_FIREBASE_TOKEN" --> AB

    MI -- "requestMediaPermission" --> PM
    PM -- "resolveMediaPermission" --> MI

    IR -- "interaction" --> TM
    CB -- "log / error" --> TM

    SC -- "MAKE_SCREENSHOT" --> SS
    SS -- "SEND_SCREENSHOT" --> SC
```

---

## 6. Host-Injected Scripts Reference

| #   | Lines   | Script                                        | Globals / Overrides                                                                                           | Purpose                                                                                                                                                                   |
| --- | ------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 2–6     | Firebase Config Bootstrap                     | `window.__firebase_config`, `window.__initial_auth_token`, `window.__app_id`                                  | Injects Firebase project config (project `bard-frontend`), a signed JWT for custom auth, and an app identifier used in Firestore paths                                    |
| 2   | 7–61    | html-to-image Library                         | Internal IIFE; origin whitelist: `gemini.google.com`, `corp.google.com`, `proxy.googlers.com`                 | MIT-licensed DOM-to-image library; captures `document.body` as PNG data URL on `MAKE_SCREENSHOT` message from whitelisted origins                                         |
| 3   | 62–108  | Firebase Auth Bridge                          | `window.requestNewFirebaseToken`                                                                              | Provides a `postMessage`-based token refresh relay; the function is defined but **never called** by the app — available for the host to trigger proactively               |
| 4   | 109–243 | getUserMedia / SpeechRecognition Interceptors | Overrides `navigator.mediaDevices.getUserMedia`, `window.SpeechRecognition`, `window.webkitSpeechRecognition` | Routes all camera/mic/speech permission requests through the parent frame; blocks access until parent grants via `resolveMediaPermission`                                 |
| 5   | 244–427 | Fetch Interceptor                             | Overrides `window.fetch`                                                                                      | Intercepts `fetch` calls to Gemini/Imagen API endpoints; if no API key is found in the request, proxies through parent via `requestFetch`/`resolveFetch` postMessage pair |
| 6   | 428     | Interaction Reporter                          | _(none)_                                                                                                      | Sends `{ type: "interaction" }` to parent on every `click`, `touchstart`, and `keydown` as an activity heartbeat                                                          |
| 7   | 429–560 | Console/Error Bridge                          | Overrides `console.log`, `console.error`                                                                      | Forwards all console output, uncaught errors (`window.onerror`), and unhandled promise rejections to parent via `log` and `error` postMessages                            |

---

## 7. Node Type System

### 7.1 NODE_DEFINITIONS Structure

All node types are declared in `NODE_DEFINITIONS` (line ~1272), a plain object keyed by type string. Each entry has:

```js
{
  category: string,          // Grouping for the node library sidebar
  title: string,             // Display name in the node header
  icon: string,              // Material Symbol ligature name
  description: string,       // Tooltip/help text
  inputs: [{ name, dataType }],   // Input port definitions (can be empty)
  outputs: [{ name, dataType }],  // Output port definitions (can be empty)
  content(node): string      // Returns inner HTML for the node body
}
```

### 7.2 Complete Node Type Reference

#### Inputs / Media

| Type             | Title          | Inputs | Outputs                            | Key Behavior                                                                      |
| ---------------- | -------------- | ------ | ---------------------------------- | --------------------------------------------------------------------------------- |
| `text-input`     | Text Input     | —      | `Text (string)`                    | Textarea; reads `.node-value` at execution time                                   |
| `file-upload`    | File Upload    | —      | `File Data (string\|base64-media)` | File picker; stores in `internalState.fileData`; PDFs → extracted text via PDF.js |
| `webcam-capture` | Webcam Capture | —      | `Image Data (base64-data-url)`     | Video preview + capture button; stores in `internalState.imageData`               |
| `audio-recorder` | Audio Recorder | —      | `Audio Data (base64-media)`        | Record/stop/play buttons; stores in `internalState.audioData`                     |
| `drawing-canvas` | Drawing Canvas | —      | `Drawing Image (base64-data-url)`  | 294x200 canvas element; outputs `.toDataURL('image/png')`                         |

#### User Interaction

| Type             | Title                     | Inputs                                              | Outputs                  | Key Behavior                                                                                                                       |
| ---------------- | ------------------------- | --------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `chat-terminal`  | Chat Terminal (Pause)     | `Agent Message (string)`, `History (string\|array)` | `User Response (string)` | Modal dialog pause; blocks until user types response. `CYCLE_BREAKER_TYPES` member                                                 |
| `chat-interface` | Chat Interface (Auto-Run) | `Agent Message (string)`                            | `User Response (object)` | Inline chat with file attach; outputs `{ text, media }`. User's Send button calls `startExecution()`. `CYCLE_BREAKER_TYPES` member |

#### AI / Logic

| Type              | Title                    | Inputs                                                                                           | Outputs                        | Key Behavior                                                                                                                                            |
| ----------------- | ------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `system-prompt`   | System Prompt            | —                                                                                                | `Prompt (string)`              | Textarea; behaves identically to `text-input`                                                                                                           |
| `llm-call`        | LLM Call (Gemini)        | `System (string)`, `User Prompt (string\|object)`, `Context/Media (string\|array\|base64-media)` | `Response (string)`            | Direct multimodal fetch; supports images, PDFs, history. Per-node model selector                                                                        |
| `ai-evaluator`    | AI Evaluator (Pass/Fail) | `Input to Evaluate (any)`, `Criteria (string)`                                                   | `Pass (any)`, `Fail (string)`  | **Multi-output**: returns `{ index: 0\|1, data }`. Routes to PASS or FAIL port based on LLM verdict. Per-node model selector                            |
| `image-gen`       | Image Gen (Imagen)       | `Prompt (string)`                                                                                | `Image Data (base64-data-url)` | Calls Imagen API; returns base64 PNG                                                                                                                    |
| `history-manager` | History Manager          | `Append Input (any)`                                                                             | `History (array)`              | **Stateful**: `internalState.buffer` persists across cycles. Read-then-write: outputs buffer *before* appending new input. `STATEFUL_NODE_TYPES` member |

#### Logic

| Type                | Title                 | Inputs          | Outputs                     | Key Behavior                                                                                                                       |
| ------------------- | --------------------- | --------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `conditional-logic` | Conditional (If/Else) | `Input A (any)` | `True (any)`, `False (any)` | **Multi-output**: evaluates operator (equals/not_equals/contains/gt/lt/is_empty) against `valueB`. Returns `{ index: 0\|1, data }` |
| `stop-signal`       | Stop Signal           | `Trigger (any)` | —                           | Sets `stopAutonomousExecution = true` when triggered in autonomous mode                                                            |

#### Text Processing

| Type                  | Title               | Inputs                | Outputs             | Key Behavior                                            |
| --------------------- | ------------------- | --------------------- | ------------------- | ------------------------------------------------------- |
| `summarization`       | Summarization       | `Input Text (string)` | `Summary (string)`  | `callGeminiAPI`, no schema                              |
| `sentiment-analysis`  | Sentiment Analysis  | `Input Text (string)` | `Sentiment (json)`  | `callGeminiAPI`, schema `{ sentiment, score }`          |
| `text-classification` | Text Classification | `Input Text (string)` | `Category (string)` | `callGeminiAPI`, categories from `node.data.categories` |

#### Integrations

| Type          | Title                  | Inputs                | Outputs                        | Key Behavior                                         |
| ------------- | ---------------------- | --------------------- | ------------------------------ | ---------------------------------------------------- |
| `web-request` | Web Request (API)      | `Body (string\|json)` | `Response Body (string\|json)` | User-configured URL/method/headers; direct `fetch()` |
| `web-search`  | Web Search (Simulated) | `Query (string)`      | `Search Summary (string)`      | `callGeminiAPI` — simulates search results via LLM   |

#### Utilities

| Type               | Title            | Inputs                                 | Outputs              | Key Behavior                                                                                |
| ------------------ | ---------------- | -------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------- |
| `string-formatter` | String Formatter | _(dynamic from template)_              | `Formatted (string)` | Template with `{variable}` placeholders; inputs created dynamically from template variables |
| `math-operation`   | Math Operation   | `Value A (number)`, `Value B (number)` | `Result (number)`    | Operators: add/subtract/multiply/divide/modulo/power                                        |

#### Data Processing

| Type             | Title               | Inputs                           | Outputs                 | Key Behavior                                                           |
| ---------------- | ------------------- | -------------------------------- | ----------------------- | ---------------------------------------------------------------------- |
| `json-parser`    | JSON Parser         | `JSON Input (json\|string)`      | `Extracted Value (any)` | Parses JSON then navigates with dot/bracket path from `node.data.path` |
| `json-extractor` | JSON Extractor (AI) | `Input Text (string)`            | `Extracted JSON (json)` | `callGeminiAPI` with user-defined schema from `node.data.schema`       |
| `code-runner`    | Code Runner (JS)    | `Input A (any)`, `Input B (any)` | `Result (any)`          | Executes `new Function('inputA', 'inputB', code)` with user-written JS |

#### Output

| Type            | Title         | Inputs        | Outputs | Key Behavior                                                                                                  |
| --------------- | ------------- | ------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| `display-value` | Display Value | `Input (any)` | —       | Renders text, markdown (via Marked.js), HTML (in sandboxed iframe), images, audio, PDFs (via PDF.js), or JSON |

### 7.3 Special Node Categories

Three constants control how nodes interact with the execution engine:

```js
const STATEFUL_NODE_TYPES = ['history-manager'];
const CYCLE_BREAKER_TYPES = ['chat-terminal', 'chat-interface'];
// Multi-output nodes: 'conditional-logic', 'ai-evaluator'
```

- **Stateful nodes**: `outputBuffer` and `internalState` persist across cycles; never reset by the engine
- **Cycle breaker nodes**: Their outgoing edges are skipped during topological sort to prevent false cycle detection; their buffers are cleared after a successful cycle (except `chat-terminal`)
- **Multi-output nodes**: Store `{ index: 0|1, data }` in `outputBuffer`; only the matching port's downstream connection receives data

---

## 8. Node Lifecycle

### 8.1 Node Creation — `createNode(type, x, y, data, id)`

Line ~1875. Steps:

1. **ID generation**: `node_{type}_{Date.now()}_{random7chars}` — or preserves the passed `id` when loading saved flows
2. **Node object**: `{ id, type, inputs, outputs, data, internalState: {}, outputBuffer: null, el }` — `inputs`/`outputs`/`data` are deep-cloned from the definition
3. **DOM element**: `<div class="node" id="{nodeId}">` with a header (icon + title + delete button) and content area (from `def.content(node)`)
4. **Position**: Grid-snapped (`GRID_SIZE = 20px`) and set via `style.left/top`
5. **Registration**: Appended to `#canvas-wrapper`, pushed to `nodes[]`
6. **Event wiring**: Delete button handler, header `mousedown` for dragging
7. **Port rendering**: `rebuildNodeIO(node)` creates input/output port elements
8. **Type-specific init**: `init*` functions bind DOM controls to `node.data` (e.g., `initWebRequestNode`, `initCodeRunnerNode`, `initModelSelector`)

### 8.2 Port System — `rebuildNodeIO(node)`

Line ~2007. Creates port DOM elements from `node.inputs[]` and `node.outputs[]`:

```html
<!-- Each input port -->
<div class="node-io">
    <div id="{nodeId}_in_{i}" class="io-port input" data-port-index="{i}" title="{name} ({dataType})"></div>
    <label class="io-label">{name}</label>
</div>
<!-- Each output port -->
<div class="node-io">
    <div id="{nodeId}_out_{i}" class="io-port output" data-port-index="{i}" title="{name} ({dataType})"></div>
    <label class="io-label">{name}</label>
</div>
```

- Output ports fire `startConnection(e, node, portIndex)` on `mousedown`
- Input ports fire `endConnection(node, portIndex)` on `mouseup`
- A guard at the top (`if (node.el.querySelector('.node-io')) return`) makes this a one-shot function — ports are never re-rendered after initial creation

### 8.3 Data Binding — `init*` Functions

All init functions follow the same pattern: read `node.data` → set DOM value → add event listener that writes back to `node.data`. Examples:

| Init Function            | Node Type                  | Fields Synced                                   |
| ------------------------ | -------------------------- | ----------------------------------------------- |
| `initWebRequestNode`     | `web-request`              | `url`, `method`, `headers`                      |
| `initCodeRunnerNode`     | `code-runner`              | `code`                                          |
| `initJsonParserNode`     | `json-parser`              | `path`                                          |
| `initMathNode`           | `math-operation`           | `a`, `b`, `op` (also live-previews result)      |
| `initConditionalNode`    | `conditional-logic`        | `op`, `valueB`                                  |
| `initStringFormatter`    | `string-formatter`         | `template` (also triggers dynamic port rebuild) |
| `initModelSelector`      | `llm-call`, `ai-evaluator` | `model` (optional per-node override)            |
| `initAIEvaluatorNode`    | `ai-evaluator`             | `criteria`                                      |
| `initHistoryManagerNode` | `history-manager`          | `internalState.buffer = []`, Clear button       |

### 8.4 Dynamic Ports — String Formatter

The `string-formatter` starts with `inputs: []`. Ports are created dynamically from `{variable}` placeholders in the template string.

`updateFormatterInputsFromTemplate(node)` (line ~3062):
1. Extracts all `{variableName}` occurrences from the template via regex
2. Compares against current `node.inputs[]`
3. If different: removes obsolete connections, updates `node.inputs` array, remaps surviving connection port indices
4. Calls `rebuildNodeIO(node)` — which only works on the first call (guard blocks subsequent calls), so the DOM ports are not visually updated after template changes (a known limitation)

---

## 9. Connection System

### 9.1 Connection Data Model

```js
connections[] = [{
    id: "conn_{fromNodeId}_{fromPortIndex}_to_{toNodeId}_{toPortIndex}",
    fromNode: string,       // Source node ID
    fromPortIndex: number,  // 0-based output port index
    fromPortId: string,     // "{nodeId}_out_{i}" — matches DOM element ID
    toNode: string,         // Target node ID
    toPortIndex: number,    // 0-based input port index
    toPortId: string        // "{nodeId}_in_{i}" — matches DOM element ID
}]
```

Duplicate prevention: `createConnection()` checks `connections.some(c => c.id === connId)` before adding. Each input port accepts only one connection (enforced in `endConnection()`).

### 9.2 SVG Rendering

Connections are drawn as SVG `<path>` elements inside `<svg id="connections-layer">`, which lives inside `#canvas-wrapper` and transforms with it.

`drawConnection(pathId, start, end)` renders a cubic Bezier curve:
```
M {start.x} {start.y} C {cx1} {start.y}, {cx2} {end.y}, {end.x} {end.y}
```
- Control points are offset horizontally by `max(50, |dx| × 0.6)` — curves flow left-to-right
- `getPortCoords(portEl)` computes port center position in canvas-wrapper space

`updateAllConnections()` redraws all SVG paths — called on every node drag, pan, zoom, port change, and connection add/remove.

### 9.3 Connection Interaction

- **Creating**: `mousedown` on output port → tracks cursor with a `potential-connection` path → `mouseup` on input port finalizes
- **Selecting**: Click on a connection path → toggles `selected` class (yellow highlight)
- **Deleting**: Delete/Backspace key with a selected connection → removes from `connections[]` and DOM

---

## 10. Execution Engine

### 10.1 Key Constants

```js
let isExecuting = false;               // Guards against concurrent runs
let isAutonomousMode = false;          // Multi-cycle mode active
let maxAutonomousCycles = 5;           // Default; user-configurable
let currentCycleCount = 0;
let stopAutonomousExecution = false;   // Set by Stop button or stop-signal node

const CYCLE_RESULT = { SUCCESS: 'success', ERROR: 'error', PAUSED_FOR_INPUT: 'paused_for_input' };
```

### 10.2 Topological Sort — `getExecutionOrder()`

Line ~3156. Standard post-order DFS producing a topological ordering (dependencies before dependents).

**Two special cases break cycles that would otherwise prevent execution:**

1. **Stateful nodes** (`history-manager`): When the current node is a stateful type, ALL incoming dependency edges are skipped. The history manager reads its own persistent buffer first, then appends new input — it doesn't need its upstream to run first in topological order.

2. **Cycle breaker nodes** (`chat-terminal`, `chat-interface`): When the SOURCE of a connection is a cycle-breaker type, that dependency edge is skipped. These nodes hold user-provided data from outside the execution — from the engine's perspective, they are self-contained source nodes.

If a genuine cycle is detected (not covered by the above skips), the function throws an error and returns `null`.

```mermaid
flowchart TD
    A["getExecutionOrder()"] --> B["For each node: visit(nodeId)"]
    B --> C{Node already<br/>fully visited?}
    C -->|Yes| D["Skip"]
    C -->|No| E{Node on current<br/>DFS stack?}
    E -->|Yes| F["THROW: Cycle detected"]
    E -->|No| G["Add to visiting set"]
    G --> H["For each incoming connection"]
    H --> I{Current node is<br/>STATEFUL_NODE_TYPES?}
    I -->|"Yes (history-manager)"| J["SKIP all incoming edges"]
    I -->|No| K{Source node is<br/>CYCLE_BREAKER_TYPES?}
    K -->|"Yes (chat-terminal/interface)"| L["SKIP this edge"]
    K -->|No| M["Recurse: visit(sourceNode)"]
    M --> H
    J --> N["Remove from visiting set"]
    L --> H
    D --> B
    N --> O["Add to visited set"]
    O --> P["Append to execution order"]
```

### 10.3 Single Cycle — `executeFlowCycle()`

Line ~3389. Runs one complete pass through all nodes in topological order.

**Phase 1 — Reset**: Clear `outputBuffer` for all nodes except stateful, cycle-breaker, conditional-logic, and ai-evaluator nodes. Remove all visual state classes.

**Phase 2 — Execute**: For each node in order:
1. Collect inputs from upstream nodes' `outputBuffer` into an `inputs[]` array indexed by port number
2. For multi-output nodes (`conditional-logic`, `ai-evaluator`): only pass data if `fromPortIndex` matches `outputBuffer.index` — inactive branch inputs stay `undefined`
3. Call `executeNode(nodeId, inputs)`
4. If result is `PAUSED_FOR_INPUT` → break the loop immediately

**Phase 3 — Cleanup** (in `finally`): On success, clear `chat-interface` and multi-output node buffers so they re-evaluate next cycle.

### 10.4 Node Execution — `executeNode(nodeId, inputData)`

Line ~3539. The large `switch(node.type)` dispatcher. For each node:

1. Adds `active` CSS class (blue pulsing glow)
2. Dispatches to type-specific logic
3. Stores output in `node.outputBuffer` (or `{ index, data }` for multi-output nodes)
4. On success: adds `success` class (green border)
5. On error: adds `error` class (red border), shows toast, **re-throws** — halting the entire cycle

**Error behavior**: One node failure = entire cycle failure = autonomous loop stops. There is no "continue on error" mode.

### 10.5 Autonomous Loop — `runAutonomousLoop()`

Line ~3343. Wraps `executeFlowCycle()` in a `while` loop:

```mermaid
flowchart TD
    A["runAutonomousLoop()"] --> B{cycleCount < max<br/>AND !stopExecution?}
    B -->|No| C["Final status:<br/>Completed or Stopped"]
    B -->|Yes| D["cycleCount++"]
    D --> E["executeFlowCycle()"]
    E --> F{Result?}

    F -->|SUCCESS| G{stopExecution<br/>set during cycle?}
    G -->|Yes| C
    G -->|No| H["Wait 500ms<br/>(inter-cycle delay)"]
    H --> B

    F -->|ERROR| I["Break: Error halts loop"]
    I --> C

    F -->|PAUSED_FOR_INPUT| J["Break: Waiting for user"]
    J --> K["User provides input<br/>via chat-interface"]
    K --> L["handleSend() calls<br/>startExecution()"]
    L --> A
```

**Loop termination conditions:**
- `currentCycleCount >= maxAutonomousCycles` → "Autonomous run completed (N cycles)"
- `stopAutonomousExecution = true` (from Stop button or `stop-signal` node) → "Goal Reached" or "Run stopped by user"
- `CYCLE_RESULT.ERROR` → stops silently
- `CYCLE_RESULT.PAUSED_FOR_INPUT` → loop exits; user must send chat input, which re-triggers `startExecution()` from cycle 0

### 10.6 OutputBuffer Lifecycle

| Moment                  | What Happens                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cycle start**         | Reset to `null` for all nodes **except** stateful, cycle-breaker, conditional-logic, ai-evaluator                                                           |
| **Node execution**      | Standard nodes: `outputBuffer = output`. Multi-output: `outputBuffer = { index, data }`. Stateful/cycle-breaker: only overwritten if `output !== null`      |
| **Input collection**    | Downstream nodes read `fromNode.outputBuffer` (or `.data` for multi-output matching port) into `inputs[toPortIndex]`                                        |
| **Cycle end (success)** | Clear `chat-interface` buffer (waits for fresh input next cycle). Clear conditional-logic and ai-evaluator buffers. History-manager buffer is NEVER cleared |

### 10.7 The Stop Signal

The `stop-signal` node (line ~3963) activates when it receives non-null input:
1. Sets `stopAutonomousExecution = true`
2. Sets status to "Goal Reached (Stop Signal)!"
3. After `executeNode()` returns, the for-loop in `executeFlowCycle()` checks `stopAutonomousExecution` at the top of the next iteration and `break`s cleanly
4. Back in `runAutonomousLoop()`, the post-cycle check sees the flag and exits the while-loop
5. In single-run mode, the stop-signal does nothing

### 10.8 Visual Feedback During Execution

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Active: executeNode() starts
    Active --> Paused: Awaiting user input\n(chat-terminal/interface)
    Paused --> Active: User provides input
    Active --> Success: Node completes successfully
    Active --> Error: Node throws error
    Success --> Idle: Next cycle resets classes
    Error --> Idle: Next cycle resets classes
    Paused --> Idle: Cycle ends

    state "CSS Classes" as css {
        state "active" as act: Blue pulsing glow\nanimation: node-pulse 1.5s
        state "paused" as pau: Yellow/amber glow\nborder: connection-potential-color
        state "success" as suc: Green border\nborder: success-color
        state "error" as err: Red border + glow\nborder: danger-color
    }
```

**Connection animation**: When a node's `outputBuffer` is read to fill a downstream input, the connecting SVG path gets class `active` (marching-ants animation with `stroke-dasharray: 8 6`). The class is removed immediately after `executeNode()` returns for the downstream node.

**Status bar states**: `running` (blue dot — "Running: NodeTitle" or "Autonomous Cycle N/M"), `success` (green — "Flow completed!" or "Goal Reached"), `error` (red — "Error in nodeType" or "Cycle Detected"), `ready` (gray — "Ready" or "Run stopped by user").

---

## 11. Canvas Interaction

### 11.1 Pan and Zoom

All canvas state is in `panZoom = { x, y, scale }`, applied as a single CSS transform on `#canvas-wrapper`:
```js
canvasWrapper.style.transform = `translate(${panZoom.x}px, ${panZoom.y}px) scale(${panZoom.scale})`;
```

- **Pan**: `mousedown` on canvas/wrapper/SVG → track `mousemove` → update `panZoom.x/y`
- **Zoom**: `wheel` + Ctrl/Cmd → adjusts `panZoom.scale` (range `0.2`–`2.5`) with zoom-toward-cursor math
- **Zoom buttons**: `±1.2×` multiplier

### 11.2 Node Dragging

`mousedown` on `.node-header` starts a drag. On `mousemove`:
- Delta is divided by `panZoom.scale` so dragging at 50% zoom moves at correct canvas speed
- Position is grid-snapped when `snapToGrid` is enabled (`GRID_SIZE = 20px`)
- `updateAllConnections()` is called each frame to redraw attached wires

### 11.3 Grid Snap

Toggled via the grid button in the toolbar. When enabled, node positions are rounded to the nearest `GRID_SIZE` (20px) multiple during both creation and dragging.

---

## 12. Predefined Modules

The `MODULES` object (line ~2460) defines 8 example flows. Each module has:

```js
{
  name: string,
  nodes: [{ type, x, y, data? }],        // Node descriptors (no IDs — assigned at load)
  connections: [{ from, fromPort, to, toPort, toPortName? }]  // Index-based references
}
```

Connections use **array indices** (not node IDs) for `from`/`to`. `loadFlow()` builds an index-to-node map during creation. The optional `toPortName` field resolves dynamic ports by name (used by `string-formatter` in the `pdf-q-and-a` module).

| Module Key                    | Name                               | Description                                                                                  |
| ----------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `autonomous-agent-loop`       | Autonomous Agent Loop              | LLM + History Manager feedback loop                                                          |
| `reflection-agent-loop`       | Reflection Agent (Self-Correction) | LLM + AI Evaluator + History Manager self-correction loop (**loaded by default on startup**) |
| `interactive-web-gen`         | Interactive Webpage Generator      | Text → LLM → Display (HTML output)                                                           |
| `sentiment-analysis-example`  | Sentiment Analysis Example         | Text → Sentiment node → Display                                                              |
| `pdf-q-and-a`                 | PDF Question & Answer              | File Upload + Text → String Formatter → LLM → Display                                        |
| `visual-storyteller-combined` | Visual Storyteller (Combined)      | LLM text + Imagen image → Code Runner combiner → Display                                     |
| `api-data-processing`         | API Data Processing                | Web Request → JSON Parser → Code Runner → Display                                            |
| `blank`                       | Blank Canvas                       | Empty canvas                                                                                 |
