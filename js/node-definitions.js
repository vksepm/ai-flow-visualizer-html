import { GEMINI_MODELS } from './state.js';

export function createModelSelectorHTML(node) {
    let options = GEMINI_MODELS.map(m =>
        `<option value="${m.id}" ${node?.data?.model === m.id ? 'selected' : ''}>${m.name}</option>`
    ).join('');

    return `
        <label>Model Override:</label>
        <select class="node-model-selector" data-node-id="${node.id}">
            <option value="">Use Global Default</option>
            ${options}
        </select>
    `;
}

// NODE_DEFINITIONS is the single source of truth for the node library.
// Each entry's `description` is read verbatim by the AI assistant (assistant.js)
// to understand what each node does — keep descriptions accurate.
// `content` is a function (not a string) so it receives the live `node` object
// to pre-populate saved `data` values when restoring a serialized flow.
export const NODE_DEFINITIONS = {
    // --- Inputs/Media ---
    'text-input': {
        category: 'Inputs/Media', title: 'Text Input', icon: 'input',
        description: 'Provides static text input or a starting user prompt.',
        content: (node) => `<textarea rows="5" class="node-value" placeholder="Enter text...">${node?.data?.value || ''}</textarea>`,
        outputs: [{name: 'Text', dataType: 'string'}]
    },
    'file-upload': {
        category: 'Inputs/Media', title: 'File Upload', icon: 'upload_file',
        description: 'Allows user to upload a file (image, PDF, etc.). PDFs are converted to text (string). Other files are base64-media.',
        content: (node) => `<label class="node-internal-button" for="file-upload-${node.id}">Select File</label><input type="file" id="file-upload-${node.id}" style="display:none;"><p id="file-info-${node.id}" style="font-size:0.8em; text-align:center; margin-top:5px;">No file selected.</p>`,
        outputs: [{name: 'File Data', dataType: 'string|base64-media'}]
    },
    'webcam-capture': {
        category: 'Inputs/Media', title: 'Webcam Capture', icon: 'photo_camera',
        description: 'Captures an image (Base64 Data URL) from the user\'s webcam.',
        content: (node) => `
        <video class="node-video-preview" autoplay playsinline muted></video>
        <div class="node-controls">
            <button class="node-internal-button start-cam-btn">Start Cam</button>
            <button class="node-internal-button capture-btn" disabled>Capture</button>
        </div>`,
        outputs: [{ name: 'Image Data (Base64)', dataType: 'base64-data-url' }]
    },
    'audio-recorder': {
        category: 'Inputs/Media', title: 'Audio Recorder', icon: 'mic',
        description: 'Records audio from the user\'s microphone.',
        content: (node) => `
        <audio controls class="node-audio-preview" style="width:100%; display:none;"></audio>
        <div class="node-controls">
            <button class="node-internal-button record-btn"><span class="material-symbols-outlined">mic</span></button>
            <button class="node-internal-button stop-btn" disabled><span class="material-symbols-outlined">stop</span></button>
            <button class="node-internal-button play-btn" disabled><span class="material-symbols-outlined">play_arrow</span></button>
            <button class="node-internal-button delete-btn" disabled><span class="material-symbols-outlined">delete</span></button>
        </div>
        <p class="audio-status" style="text-align:center; font-size:0.8em; margin-top:8px;">Idle.</p>`,
        outputs: [{ name: 'Audio Data', dataType: 'base64-media' }]
    },
    'drawing-canvas': {
        category: 'Inputs/Media', title: 'Drawing Canvas', icon: 'draw',
        description: 'Allows user to draw an image (Outputs Base64 Data URL).',
        content: (node) => `
        <canvas class="node-drawing-canvas" width="294" height="200" style="touch-action: none;"></canvas>
        <div class="node-controls">
            <button class="node-internal-button erase-btn">Erase</button>
        </div>`,
        outputs: [{ name: 'Drawing Image (Base64)', dataType: 'base64-data-url' }]
    },

    // --- User Interaction ---
    'chat-terminal': {
        category: 'User Interaction',
        title: 'Chat Terminal (Pause)',
        icon: 'forum',
        description: 'CYCLE BREAKER: PAUSES flow for user input via MODAL. Takes Agent Message (Input 0) and History (Input 1), outputs User Response.',
        content: (node) => `<p>Pauses execution and asks the user for input via modal dialog.</p><label>Last Agent Message:</label><pre class="node-output-preview output-with-copy"></pre>`,
        inputs: [{ name: 'Agent Message', dataType: 'string' }, { name: 'History (Optional)', dataType: 'string|array' }],
        outputs: [{ name: 'User Response', dataType: 'string' }]
    },
    'chat-interface': {
        category: 'User Interaction',
        title: 'Chat Interface (Auto-Run)',
        icon: 'chat',
        description: 'CYCLE BREAKER: Interactive chat UI. Displays agent messages (Input 0). Accepts user text and files. Auto-triggers flow on send. Output is structured object {text, media}.',
        content: (node) => `
            <div class="node-chat-container">
                <div class="node-chat-messages"></div>
                <div class="node-chat-input-area">
                    <input type="file" class="node-chat-file-input" style="display: none;" accept="image/*,.pdf,.txt">
                    <button class="node-internal-button node-chat-attach-btn" title="Attach File"><span class="material-symbols-outlined">attach_file</span></button>
                    <input type="text" class="node-chat-input" placeholder="Type message...">
                    <button class="node-internal-button node-chat-send-btn"><span class="material-symbols-outlined">send</span></button>
                </div>
                <p class="node-chat-file-status" style="font-size: 0.7em; color: var(--secondary-text); margin-top: 4px; margin-bottom: 0;">No file attached.</p>
            </div>
        `,
        inputs: [{ name: 'Agent Message', dataType: 'string' }],
        outputs: [{ name: 'User Response (Structured)', dataType: 'object' }]
    },

    // --- AI/Logic ---
    'system-prompt': {
        category: 'AI/Logic',
        title: 'System Prompt',
        icon: 'code_blocks',
        description: 'CRITICAL: Defines the LLM\'s role, constraints, and output format. MUST be connected to Input 0 of an llm-call node. Configure data.value.',
        content: (node) => `<textarea rows="6" class="node-value" placeholder="You are a helpful assistant...">${node?.data?.value || ''}</textarea>`,
        outputs: [{name: 'Prompt', dataType: 'string'}]
    },
    'llm-call': {
        category: 'AI/Logic',
        title: 'LLM Call (Gemini)',
        icon: 'hub',
        description: 'Calls the LLM. Input 0: System prompt. Input 1: User query (text/multimodal). Input 2: Context/History/Media.',
        content: (node) => `
            ${createModelSelectorHTML(node)}
            <p>Combines prompts and calls Gemini.</p>
            <pre class="node-output-preview output-with-copy"></pre>
        `,
        inputs: [
            {name: 'System (Optional)', dataType: 'string'},
            {name: 'User Prompt', dataType: 'string|object'},
            {name: 'Context/Media (Optional)', dataType: 'string|array|base64-media'}
        ],
        outputs: [{name: 'Response', dataType: 'string'}]
    },
    'ai-evaluator': {
        category: 'AI/Logic',
        title: 'AI Evaluator (Pass/Fail)',
        icon: 'rule',
        description: 'Evaluates Input (0) against Criteria (Input 1 or Config). Outputs Input (0) to Pass (0), or AI Feedback (string) to Fail (1). Essential for loops.',
        content: (node) => `
        ${createModelSelectorHTML(node)}
        <label>Evaluation Criteria (if Input 1 is empty):</label>
        <textarea rows="4" class="evaluation-criteria" placeholder="Does the input contain a valid JSON object?">${node?.data?.criteria || ''}</textarea>
        <p>Evaluates input against criteria using AI judgment.</p>`,
        inputs: [{ name: 'Input to Evaluate', dataType: 'any' }, { name: 'Criteria (Optional)', dataType: 'string' }],
        outputs: [{ name: 'Pass (Input)', dataType: 'any' }, { name: 'Fail (Feedback)', dataType: 'string' }]
    },
    'image-gen': {
        category: 'AI/Logic',
        title: 'Image Gen (Imagen)',
        icon: 'image',
        description: 'Generates an image based on a text prompt. Output is a Base64 Data URL.',
        content: () => `<p>Generates an image from a prompt.</p><div class="display-value-content output-with-copy"><img class="node-output-preview" style="display:none;"/></div>`,
        inputs: [{name: 'Prompt', dataType: 'string'}],
        outputs: [{name: 'Image Data (Base64)', dataType: 'base64-data-url'}]
    },
    'history-manager': {
        category: 'AI/Logic',
        title: 'History Manager',
        icon: 'memory',
        description: 'STATEFUL: Accumulates inputs into a persistent buffer (array). Used for chat history or agent memory/feedback loops. REQUIRED to break cycles in autonomous agents.',
        content: (node) => `
            <p>Manages state/history across runs.</p>
            <button class="node-internal-button clear-history-btn">Clear History</button>
            <label>Current Items:</label>
            <pre class="node-output-preview history-count">0</pre>
        `,
        inputs: [{ name: 'Append Input', dataType: 'any'}],
        outputs: [{ name: 'History (Array)', dataType: 'array'}]
    },

    // --- Logic ---
    'conditional-logic': {
        category: 'Logic',
        title: 'Conditional (If/Else)',
        icon: 'call_split',
        description: 'Routes flow. If Input A meets condition relative to Value B, outputs to True (0), otherwise False (1).',
        content: (node) => `
        <label>Input A vs Value B:</label>
        <div class="node-input-row">
            <select class="condition-operator">
                <option value="equals" ${node?.data?.op === 'equals' ? 'selected' : ''}>Equals (==)</option>
                <option value="not_equals" ${node?.data?.op === 'not_equals' ? 'selected' : ''}>Not Equals (!=)</option>
                <option value="contains" ${node?.data?.op === 'contains' ? 'selected' : ''}>Contains</option>
                <option value="not_contains" ${node?.data?.op === 'not_contains' ? 'selected' : ''}>Does Not Contain</option>
                <option value="gt" ${node?.data?.op === 'gt' ? 'selected' : ''}>Greater Than (>)</option>
                <option value="lt" ${node?.data?.op === 'lt' ? 'selected' : ''}>Less Than (<)</option>
                <option value="is_empty" ${node?.data?.op === 'is_empty' ? 'selected' : ''}>Is Empty</option>
            </select>
        </div>
        <label>Value B (Static):</label>
        <input type="text" class="condition-value-b" placeholder="Value to compare against" value="${node?.data?.valueB || ''}">
        `,
        inputs: [{ name: 'Input A', dataType: 'any' }],
        outputs: [{ name: 'True', dataType: 'any' }, { name: 'False', dataType: 'any' }]
    },
    'stop-signal': {
        category: 'Logic',
        title: 'Stop Signal (Goal Reached)',
        icon: 'stop_circle',
        description: 'When triggered by input, immediately halts autonomous execution, signaling task completion.',
        content: () => `<p>Halts autonomous execution when triggered.</p>`,
        inputs: [{ name: 'Trigger', dataType: 'any' }],
        outputs: []
    },

    // --- Text Processing ---
    'summarization': { category: 'Text Processing', title: 'Summarization', icon: 'short_text', description: 'Uses AI to create a concise summary of the input text.',
        content: () => `<p>Summarizes the input text.</p><pre class="node-output-preview output-with-copy"></pre>`,
        inputs: [{ name: 'Input Text', dataType: 'string' }], outputs: [{ name: 'Summary', dataType: 'string' }]
    },
    'sentiment-analysis': { category: 'Text Processing', title: 'Sentiment Analysis', icon: 'sentiment_satisfied', description: 'Uses AI to determine sentiment (Positive/Negative) and score of input text.',
        content: () => `<p>Analyzes sentiment (Positive/Negative/Neutral) and score (0-1).</p><pre class="node-output-preview output-with-copy"></pre>`,
        inputs: [{ name: 'Input Text', dataType: 'string' }], outputs: [{ name: 'Sentiment (JSON)', dataType: 'json' }]
    },
    'text-classification': { category: 'Text Processing', title: 'Text Classification', icon: 'label', description: 'Uses AI to classify input text into predefined categories. Configure data.categories.',
        content: (node) => `
        <label>Categories (one per line):</label>
        <textarea rows="4" class="classification-categories" placeholder="Sales\nSupport\nBilling">${node?.data?.categories || ''}</textarea>
        <p>Classifies input text into one of the above categories.</p>`,
        inputs: [{ name: 'Input Text', dataType: 'string' }], outputs: [{ name: 'Category', dataType: 'string' }]
    },

    // --- Integrations ---
    'web-request': { category: 'Integrations', title: 'Web Request (API)', icon: 'http', description: 'Makes an HTTP request (GET, POST, etc.) to an external URL or API.',
        content: (node) => `
        <label>URL:</label>
        <input type="text" class="web-request-url" placeholder="https://api.example.com/data" value="${node?.data?.url || ''}">
        <div class="node-input-row">
            <label>Method:</label>
            <select class="web-request-method">
                <option value="GET" ${node?.data?.method === 'GET' ? 'selected' : ''}>GET</option>
                <option value="POST" ${node?.data?.method === 'POST' ? 'selected' : ''}>POST</option>
                <option value="PUT" ${node?.data?.method === 'PUT' ? 'selected' : ''}>PUT</option>
            </select>
        </div>
        <label>Headers (JSON):</label>
        <textarea rows="3" class="web-request-headers" placeholder='{"Content-Type": "application/json"}'>${node?.data?.headers || ''}</textarea>
        <p>If using POST/PUT, connect body data to input.</p>`,
        inputs: [{ name: 'Body (Optional)', dataType: 'string|json' }],
        outputs: [{ name: 'Response Body', dataType: 'string|json' }]
    },
    'web-search': { category: 'Integrations', title: 'Web Search (Simulated)', icon: 'search', description: 'Simulates a web search by asking the LLM for information on a topic.',
        content: () => `<p>Simulates a web search using Gemini to retrieve information.</p><pre class="node-output-preview output-with-copy"></pre>`,
        inputs: [{ name: 'Query', dataType: 'string' }], outputs: [{ name: 'Search Summary', dataType: 'string' }]
    },

    // --- Utilities ---
    'string-formatter': {
        category: 'Utilities', title: 'String Formatter', icon: 'format_quote',
        description: 'Combines inputs for prompt engineering. Define variables like {context} in data.template.',
        content: (node) => `
        <label>Template (use {variable}):</label><textarea class="template-input" rows="4" placeholder="Hello {name}! You are {age}.">${node?.data?.template || 'Hello {name}!'}</textarea>
        <label style="margin-top:10px;">Output Preview:</label><pre class="node-output-preview output-with-copy"></pre>`,
        inputs: [],
        outputs: [{name: 'Formatted', dataType: 'string'}]
    },
    'math-operation': { category: 'Utilities', title: 'Math Operation', icon: 'calculate', description: 'Performs basic arithmetic (add, subtract, multiply, divide) on two numbers.', content: (node) => `
        <div class="node-input-row">
            <label>Value A:</label>
            <input type="number" class="math-value-a" value="${node?.data?.a || 0}">
        </div>
        <div class="node-input-row">
            <label>Value B:</label>
            <input type="number" class="math-value-b" value="${node?.data?.b || 0}">
        </div>
        <div class="node-input-row">
            <label>Operation:</label>
            <select class="math-op-select">
                <option value="add" ${node?.data?.op === 'add' ? 'selected' : ''}>Add</option>
                <option value="subtract" ${node?.data?.op === 'subtract' ? 'selected' : ''}>Subtract</option>
                <option value="multiply" ${node?.data?.op === 'multiply' ? 'selected' : ''}>Multiply</option>
                <option value="divide" ${node?.data?.op === 'divide' ? 'selected' : ''}>Divide</option>
                <option value="modulo" ${node?.data?.op === 'modulo' ? 'selected' : ''}>Modulo</option>
                <option value="power" ${node?.data?.op === 'power' ? 'selected' : ''}>Power</option>
            </select>
        </div>
        <label>Result:</label>
        <pre class="node-output-preview output-with-copy"></pre>`,
    inputs: [{ name: 'Value A (Optional)', dataType: 'number' }, { name: 'Value B (Optional)', dataType: 'number' }],
    outputs: [{ name: 'Result', dataType: 'number' }]
    },

    // --- Data Processing ---
    'json-parser': { category: 'Data Processing', title: 'JSON Parser', icon: 'data_object', description: 'Extracts a value from JSON using a path (e.g., data[0].name).',
        content: (node) => `
        <label>Path (e.g., data[0].name):</label>
        <input type="text" class="json-path-input" placeholder="path.to.value" value="${node?.data?.path || ''}">
        <p>Extracts a value from a JSON input string.</p>
        <label>Extracted Value:</label>
        <pre class="node-output-preview output-with-copy"></pre>`,
        inputs: [{ name: 'JSON Input', dataType: 'json|string' }],
        outputs: [{ name: 'Extracted Value', dataType: 'any' }]
    },
    'json-extractor': { category: 'Data Processing', title: 'JSON Extractor (AI)', icon: 'polyline', description: 'Uses AI to extract structured JSON data from unstructured text based on a schema.',
        content: (node) => `
        <label>Desired JSON Schema:</label>
        <textarea rows="5" class="json-schema-input" placeholder='{"name": "string", "email": "string"}'>${node?.data?.schema || ''}</textarea>
        <p>Uses AI to extract structured data from unstructured text based on the schema.</p>`,
        inputs: [{ name: 'Input Text', dataType: 'string' }], outputs: [{ name: 'Extracted JSON', dataType: 'json' }]
    },
    'code-runner': {
        category: 'Data Processing',
        title: 'Code Runner (JS)',
        icon: 'javascript',
        description: 'Executes JS. Use return. Crucial for formatting HTML output. Access inputs via inputA and inputB.',
        content: (node) => `
        <p>Write JS code. Access inputs via variables <code>inputA</code> and <code>inputB</code>. Must include a <code>return</code> statement.</p>
        <textarea class="code-input" rows="8" placeholder="// Example: Combine text (A) and image URL (B)\n// return \`<div>\${inputA}</div><img src='\${inputB}'/>\`;">${node?.data?.code || 'return inputA;'}</textarea>
        `,
        inputs: [{ name: 'Input A', dataType: 'any' }, { name: 'Input B (Optional)', dataType: 'any'}],
        outputs: [{ name: 'Result', dataType: 'any' }]
    },

    // --- Output ---
    'display-value': {
        category: 'Output', title: 'Display Value', icon: 'visibility',
        description: 'Displays the final output (text, HTML preview (iframe), image (Base64), JSON, or PDF). Expands for HTML previews.',
        content: () => `<div class="display-value-content node-value output-with-copy">N/A</div>`,
        inputs: [{name: 'Input', dataType: 'any'}]
    },
};
