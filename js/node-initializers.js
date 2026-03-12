import { state } from './state.js';
import { updateAllConnections } from './connections.js';
import { rebuildNodeIO } from './node-creation.js';
import { showToast } from './ui.js';
import { startExecution } from './execution-engine.js';

// --- Model Selector ---
export function initModelSelector(node) {
    const selector = node.el.querySelector('.node-model-selector');
    if (selector) {
        if (node.data.model && selector.value !== node.data.model) {
            selector.value = node.data.model;
        }
        selector.addEventListener('change', () => {
            node.data.model = selector.value || undefined;
        });
    }
}

// --- AI Evaluator ---
export function initAIEvaluatorNode(node) {
    const criteriaInput = node.el.querySelector('.evaluation-criteria');
    if (node.data.criteria && criteriaInput.value !== node.data.criteria) {
        criteriaInput.value = node.data.criteria;
    }
    criteriaInput.addEventListener('input', () => {
        node.data.criteria = criteriaInput.value;
    });
}

// --- Chat Interface ---
export function initChatInterfaceNode(node) {
    const sendBtn = node.el.querySelector('.node-chat-send-btn');
    const inputEl = node.el.querySelector('.node-chat-input');
    const attachBtn = node.el.querySelector('.node-chat-attach-btn');
    const fileInput = node.el.querySelector('.node-chat-file-input');
    const fileStatus = node.el.querySelector('.node-chat-file-status');

    node.internalState.attachedFile = null;

    attachBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64String = e.target.result.split(',')[1];
            node.internalState.attachedFile = { data: base64String, mimeType: file.type, fileName: file.name };
            fileStatus.textContent = `Attached: ${file.name}`;
        };
        reader.readAsDataURL(file);
    });

    const handleSend = () => {
        const messageText = inputEl.value.trim();
        const attachedFile = node.internalState.attachedFile;

        if (!messageText && !attachedFile) return;

        const displayMessage = messageText || `[File: ${attachedFile.fileName}]`;
        addMessageToChatUI(node, displayMessage, 'user');

        node.outputBuffer = {
            text: messageText,
            media: attachedFile
        };

        inputEl.value = '';
        node.internalState.attachedFile = null;
        fileInput.value = '';
        fileStatus.textContent = 'No file attached.';

        if (!state.isExecuting || node.el.classList.contains('paused')) {
            node.el.classList.remove('paused');
            startExecution();
        } else {
            console.log("Chat input received while flow is running. Will be processed in the next cycle/execution.");
        }
    };

    sendBtn.addEventListener('click', handleSend);
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSend();
        }
    });
}

export function addMessageToChatUI(node, message, sender) {
    const messagesContainer = node.el.querySelector('.node-chat-messages');
    if (!messagesContainer) return;
    const msgEl = document.createElement('div');
    msgEl.className = `node-chat-msg ${sender}`;
    msgEl.textContent = message;
    messagesContainer.appendChild(msgEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// --- Text Classification ---
export function initTextClassificationNode(node) {
    const categoriesInput = node.el.querySelector('.classification-categories');
    if (node.data.categories && categoriesInput.value !== node.data.categories) {
        categoriesInput.value = node.data.categories;
    }
    categoriesInput.addEventListener('input', () => {
        node.data.categories = categoriesInput.value;
    });
}

// --- JSON Extractor ---
export function initJsonExtractorNode(node) {
    const schemaInput = node.el.querySelector('.json-schema-input');
    if (node.data.schema && schemaInput.value !== node.data.schema) {
        schemaInput.value = node.data.schema;
    }
    schemaInput.addEventListener('input', () => {
        node.data.schema = schemaInput.value;
    });
}

// --- Web Request ---
export function initWebRequestNode(node) {
    const urlInput = node.el.querySelector('.web-request-url');
    const methodSelect = node.el.querySelector('.web-request-method');
    const headersInput = node.el.querySelector('.web-request-headers');

    if (node.data.url) urlInput.value = node.data.url;
    if (node.data.method) methodSelect.value = node.data.method;
    if (node.data.headers) headersInput.value = node.data.headers;

    const update = () => {
        node.data.url = urlInput.value;
        node.data.method = methodSelect.value;
        node.data.headers = headersInput.value;
    };

    urlInput.addEventListener('input', update);
    methodSelect.addEventListener('change', update);
    headersInput.addEventListener('input', update);
}

// --- Code Runner ---
export function initCodeRunnerNode(node) {
    const codeInput = node.el.querySelector('.code-input');
    if (node.data.code && codeInput.value !== node.data.code) {
        codeInput.value = node.data.code;
    }
    codeInput.addEventListener('input', () => {
        node.data.code = codeInput.value;
    });
}

// --- JSON Parser ---
export function initJsonParserNode(node) {
    const pathInput = node.el.querySelector('.json-path-input');
    if (node.data.path && pathInput.value !== node.data.path) {
        pathInput.value = node.data.path;
    }
    pathInput.addEventListener('input', () => {
        node.data.path = pathInput.value;
    });
}

// --- Math ---
export function calculateMath(a, b, op) {
    a = isNaN(a) ? 0 : a;
    b = isNaN(b) ? 0 : b;
    switch (op) {
        case 'add': return a + b;
        case 'subtract': return a - b;
        case 'multiply': return a * b;
        case 'divide': return b !== 0 ? a / b : 'Infinity';
        case 'modulo': return b !== 0 ? a % b : 'NaN';
        case 'power': return Math.pow(a, b);
        default: return 'N/A';
    }
}

export function initMathNode(node) {
    const valA_input = node.el.querySelector('.math-value-a');
    const valB_input = node.el.querySelector('.math-value-b');
    const op_select = node.el.querySelector('.math-op-select');
    const result_pre = node.el.querySelector('.node-output-preview');

    if (node.data.a !== undefined) valA_input.value = node.data.a;
    if (node.data.b !== undefined) valB_input.value = node.data.b;
    if (node.data.op) op_select.value = node.data.op;

    const update = () => {
        node.data.a = parseFloat(valA_input.value);
        node.data.b = parseFloat(valB_input.value);
        node.data.op = op_select.value;
        const result = calculateMath(node.data.a, node.data.b, node.data.op);
        result_pre.textContent = result;
    };

    valA_input.addEventListener('input', update);
    valB_input.addEventListener('input', update);
    op_select.addEventListener('change', update);
    update();
}

// --- Drawing ---
export function initDrawingNode(node) {
    const drawCanvas = node.el.querySelector('.node-drawing-canvas');
    const eraseBtn = node.el.querySelector('.erase-btn');
    const ctx = drawCanvas.getContext('2d');
    let isDrawing = false, lastX = 0, lastY = 0;
    ctx.strokeStyle = '#EAEAEA'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    const getCoords = (e) => {
        const rect = drawCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const draw = (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        const { x, y } = getCoords(e);
        ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(x, y); ctx.stroke();
        [lastX, lastY] = [x, y];
    };

    const startDrawing = (e) => { isDrawing = true; const { x, y } = getCoords(e);[lastX, lastY] = [x, y]; };
    const stopDrawing = () => isDrawing = false;

    drawCanvas.addEventListener('mousedown', startDrawing);
    drawCanvas.addEventListener('mousemove', draw);
    drawCanvas.addEventListener('mouseup', stopDrawing);
    drawCanvas.addEventListener('mouseout', stopDrawing);
    drawCanvas.addEventListener('touchstart', startDrawing, { passive: false });
    drawCanvas.addEventListener('touchmove', draw, { passive: false });
    drawCanvas.addEventListener('touchend', stopDrawing);
    eraseBtn.addEventListener('click', () => ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height));
}

// --- Audio ---
export function initAudioNode(node) {
    const audioEl = node.el.querySelector('.node-audio-preview');
    const recordBtn = node.el.querySelector('.record-btn');
    const stopBtn = node.el.querySelector('.stop-btn');
    const playBtn = node.el.querySelector('.play-btn');
    const deleteBtn = node.el.querySelector('.delete-btn');
    const statusP = node.el.querySelector('.audio-status');
    let mediaRecorder, audioChunks = [];

    recordBtn.addEventListener('click', async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            node.internalState.stream = stream;
            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const audioUrl = URL.createObjectURL(audioBlob);
                audioEl.src = audioUrl;
                const reader = new FileReader();
                reader.onload = (e) => {
                    node.internalState.audioData = { data: e.target.result.split(',')[1], mimeType: 'audio/webm', fileName: `recording-${Date.now()}.webm` };
                };
                reader.readAsDataURL(audioBlob);
                if (node.internalState.stream) node.internalState.stream.getTracks().forEach(track => track.stop());
            };
            audioChunks = []; mediaRecorder.start();
            statusP.textContent = 'Recording...';
            recordBtn.disabled = true; stopBtn.disabled = false; playBtn.disabled = true; deleteBtn.disabled = true;
        } catch(err) { console.error("Mic error:", err); showToast("Could not access microphone.", "error"); }
    });

    stopBtn.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        statusP.textContent = 'Stopped.';
        recordBtn.disabled = false; stopBtn.disabled = true; playBtn.disabled = false; deleteBtn.disabled = false;
    });
    playBtn.addEventListener('click', () => { audioEl.play(); statusP.textContent = 'Playing...'; audioEl.onended = () => statusP.textContent = 'Stopped.'; });
    deleteBtn.addEventListener('click', () => {
        audioChunks = []; node.internalState.audioData = null; audioEl.src = ''; statusP.textContent = 'Idle.';
        recordBtn.disabled = false; stopBtn.disabled = true; playBtn.disabled = true; deleteBtn.disabled = true;
    });
}

// --- Webcam ---
export function initWebcamNode(node) {
    const video = node.el.querySelector('.node-video-preview');
    const startBtn = node.el.querySelector('.start-cam-btn');
    const captureBtn = node.el.querySelector('.capture-btn');

    startBtn.addEventListener('click', async () => {
        if (node.internalState.stream) {
            node.internalState.stream.getTracks().forEach(track => track.stop());
            video.srcObject = null; node.internalState.stream = null;
            captureBtn.disabled = true; startBtn.innerHTML = 'Start Cam';
        } else {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                video.srcObject = stream; node.internalState.stream = stream;
                captureBtn.disabled = false; startBtn.innerHTML = 'Stop Cam';
            } catch (err) { console.error("Webcam error:", err); showToast("Could not access webcam.", "error"); }
        }
    });

    captureBtn.addEventListener('click', () => {
        if (!node.internalState.stream) { showToast("Camera is not active.", "error"); return; }
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = video.videoWidth; tempCanvas.height = video.videoHeight;
        tempCanvas.getContext('2d').drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
        const imageDataUrl = tempCanvas.toDataURL('image/png');
        node.internalState.imageData = imageDataUrl;
        showToast("Image captured!");
    });
}

// --- File Upload ---
export function handleFileSelect(event, node) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const base64String = e.target.result.split(',')[1];
        node.internalState.fileData = { data: base64String, mimeType: file.type, fileName: file.name };
        node.el.querySelector(`#file-info-${node.id}`).textContent = file.name;
    };
    reader.readAsDataURL(file);
}

// --- String Formatter ---
export function initStringFormatter(node) {
    const templateInput = node.el.querySelector('.template-input');

    if (node.data.template && templateInput.value !== node.data.template) {
        templateInput.value = node.data.template;
    }

    templateInput.addEventListener('input', () => {
        node.data.template = templateInput.value;
        updateFormatterInputsFromTemplate(node);
        runStringFormatter(node);
    });
    updateFormatterInputsFromTemplate(node);
    runStringFormatter(node);
}

// Called on every template keystroke. Diffs current ports against variable names
// extracted from the template; reconnects preserved connections by name so
// renaming a variable doesn't silently break the graph.
function updateFormatterInputsFromTemplate(node) {
    const template = node.data.template || '';
    const regex = /\{([^{}]+)\}/g; let match;
    const requiredKeys = new Set();
    while ((match = regex.exec(template)) !== null) requiredKeys.add(match[1].trim());

    const currentInputs = node.inputs.map(i => i.name);
    const newKeys = Array.from(requiredKeys);

    if (JSON.stringify(currentInputs.sort()) !== JSON.stringify(newKeys.sort())) {
        const connectionsToKeep = []; const connectionsToRemove = [];
        state.connections.forEach(c => {
            if (c.toNode === node.id) {
                const keyName = node.inputs[c.toPortIndex]?.name;
                if (requiredKeys.has(keyName)) connectionsToKeep.push({ ...c, keyName: keyName });
                else connectionsToRemove.push(c.id);
            }
        });

        state.connections = state.connections.filter(c => !connectionsToRemove.includes(c.id));
        connectionsToRemove.forEach(id => document.getElementById(id)?.remove());

        // Remove existing IO ports before rebuild
        node.el.querySelectorAll('.node-io').forEach(el => el.remove());

        node.inputs = newKeys.map(key => ({ name: key, dataType: 'any', label: key }));
        rebuildNodeIO(node);

        connectionsToKeep.forEach(c => {
            const newIndex = node.inputs.findIndex(input => input.name === c.keyName);
            if (newIndex !== -1) {
                const conn = state.connections.find(conn => conn.id === c.id);
                if (conn) {
                    conn.toPortId = `${node.id}_in_${newIndex}`;
                    conn.toPortIndex = newIndex;
                }
            }
        });
        updateAllConnections();
    }
}

export function runStringFormatter(node, inputData = {}) {
    let result = node.data.template || node.el.querySelector('.template-input').value;
    node.inputs.forEach((input, i) => {
        const value = inputData[i] !== undefined ? inputData[i] : (node.inputBuffer ? (node.inputBuffer[i] ?? '') : '');
        result = result.replace(new RegExp(`\\{${input.name}\\}`, 'g'), String(value));
    });
    node.el.querySelector('.node-output-preview').textContent = result;
    return result;
}

// --- History Manager ---
export function initHistoryManagerNode(node) {
    // internalState.buffer is the only durable state this node owns across cycles.
    // The execution engine never clears it — only the user's Clear button does.
    if (!node.internalState.buffer) {
        node.internalState.buffer = [];
    }

    const clearBtn = node.el.querySelector('.clear-history-btn');
    const countPre = node.el.querySelector('.history-count');

    const updateCount = () => {
        countPre.textContent = node.internalState.buffer.length;
    };

    clearBtn.addEventListener('click', () => {
        node.internalState.buffer = [];
        updateCount();
        showToast("History buffer cleared.");
    });

    updateCount();
}

// --- Conditional Logic ---
export function initConditionalNode(node) {
    const operatorSelect = node.el.querySelector('.condition-operator');
    const valueBInput = node.el.querySelector('.condition-value-b');

    if (node.data.op) operatorSelect.value = node.data.op;
    if (node.data.valueB) valueBInput.value = node.data.valueB;

    const update = () => {
        node.data.op = operatorSelect.value;
        node.data.valueB = valueBInput.value;
    };

    operatorSelect.addEventListener('change', update);
    valueBInput.addEventListener('input', update);
}

// --- Regex (stub — not defined in NODE_DEFINITIONS but referenced) ---
export function initRegexNode(node) {
    // No-op: regex-processor is not in NODE_DEFINITIONS
}

// --- updateNode: called by AI assistant to sync UI after data changes ---
export function updateNode(nodeId, newData) {
    const node = state.nodes.find(n => n.id === nodeId); if (!node) return;
    Object.assign(node.data, newData);
    const nodeEl = node.el; if (!nodeEl) return;

    switch (node.type) {
        case 'text-input': case 'system-prompt': {
            const textarea = nodeEl.querySelector('.node-value');
            if (textarea && newData.value !== undefined) textarea.value = newData.value;
            break;
        }
        case 'math-operation': initMathNode(node); break;
        case 'string-formatter': initStringFormatter(node); break;
        case 'json-parser': initJsonParserNode(node); break;
        case 'code-runner': initCodeRunnerNode(node); break;
        case 'web-request': initWebRequestNode(node); break;
        case 'text-classification': initTextClassificationNode(node); break;
        case 'json-extractor': initJsonExtractorNode(node); break;
        case 'ai-evaluator': initAIEvaluatorNode(node); break;
    }
    if (['llm-call', 'ai-evaluator'].includes(node.type)) {
        initModelSelector(node);
    }
}
