import { state, canvasWrapper, modulesDropdownBtn } from './state.js';
import { createNode } from './node-creation.js';
import { createConnection, updateAllConnections, resetSvgConnections } from './connections.js';
import { updateTransform } from './canvas.js';
import { setStatus } from './ui.js';

export const MODULES = {
    'autonomous-agent-loop': {
        name: 'Autonomous Agent Loop (Thinking)',
        nodes: [
            { type: 'text-input', x: 60, y: 60, data: { value: 'Generate a numbered list of 5 ideas for a new sci-fi movie.' } },
            { type: 'system-prompt', x: 60, y: 260, data: { value: 'You are an autonomous agent. Your task is provided by the user. You must think step-by-step. If you receive history (Context/Media), review it and continue the task based on the previous steps. Respond with your next thought or action.' } },
            { type: 'history-manager', x: 400, y: 460 },
            { type: 'llm-call', x: 760, y: 200 },
            { type: 'display-value', x: 1100, y: 460 }
        ],
        connections: [
            { from: 0, fromPort: 0, to: 3, toPort: 1 },
            { from: 1, fromPort: 0, to: 3, toPort: 0 },
            { from: 2, fromPort: 0, to: 3, toPort: 2 },
            { from: 3, fromPort: 0, to: 2, toPort: 0 },
            { from: 2, fromPort: 0, to: 4, toPort: 0 }
        ]
    },
    'reflection-agent-loop': {
        name: 'Reflection Agent (Self-Correction)',
        nodes: [
            { type: 'text-input', x: 60, y: 60, data: { value: 'Tell me a short, funny joke about chickens.' } },
            { type: 'system-prompt', x: 60, y: 260, data: { value: 'You are a comedian agent. Fulfill the user request. If you receive previous attempts/feedback (Context), review them and try to generate a better, funnier response that meets the evaluation criteria.' } },
            { type: 'history-manager', x: 760, y: 560 },
            { type: 'llm-call', x: 400, y: 200 },
            { type: 'ai-evaluator', x: 760, y: 200, data: { criteria: 'Is the input a joke about chickens? Is it short (less than 3 sentences)? Does it contain a clear punchline? If yes to all, PASS. If FAIL, provide feedback on why it failed (e.g. "Too long", "Not about chickens").'}},
            { type: 'display-value', x: 1100, y: 360 },
            { type: 'stop-signal', x: 1100, y: 160 }
        ],
        connections: [
            { from: 0, fromPort: 0, to: 3, toPort: 1 },
            { from: 1, fromPort: 0, to: 3, toPort: 0 },
            { from: 3, fromPort: 0, to: 4, toPort: 0 },
            { from: 4, fromPort: 0, to: 5, toPort: 0 },
            { from: 4, fromPort: 0, to: 6, toPort: 0 },
            { from: 4, fromPort: 1, to: 2, toPort: 0 },
            { from: 2, fromPort: 0, to: 3, toPort: 2 },
        ]
    },
    'interactive-web-gen': {
        name: 'Interactive Webpage Generator',
        nodes: [
            { type: 'text-input', x: 60, y: 80, data: { value: 'A landing page for a new coffee shop called "The Daily Grind".' } },
            { type: 'system-prompt', x: 60, y: 320, data: { value: 'You are an expert web developer specializing in modern, clean designs. Based on the user\'s request, create a complete, single-file HTML document using TailwindCSS (include the CDN script in the head). The webpage should be visually appealing and responsive. Respond with only the HTML code, starting with <!DOCTYPE html>. Do not wrap the HTML in a markdown code block (no ```).' } },
            { type: 'llm-call', x: 460, y: 220 },
            { type: 'display-value', x: 860, y: 220 }
        ],
        connections: [ { from: 0, fromPort: 0, to: 2, toPort: 1 }, { from: 1, fromPort: 0, to: 2, toPort: 0 }, { from: 2, fromPort: 0, to: 3, toPort: 0 } ]
    },
    'sentiment-analysis-example': {
        name: 'Sentiment Analysis Example',
        nodes: [
            { type: 'text-input', x: 60, y: 60, data: { value: 'I absolutely loved the new feature! It works perfectly and saved me hours of work. Highly recommended.' } },
            { type: 'sentiment-analysis', x: 400, y: 100 },
            { type: 'display-value', x: 760, y: 100 }
        ],
        connections: [
            { from: 0, fromPort: 0, to: 1, toPort: 0 },
            { from: 1, fromPort: 0, to: 2, toPort: 0 }
        ]
    },
    'pdf-q-and-a': {
        name: 'PDF Question & Answer (Simple)',
        nodes: [
            { type: 'file-upload', x: 60, y: 80 },
            { type: 'text-input', x: 60, y: 280, data: { value: 'What is the main conclusion of this document?' } },
            { type: 'string-formatter', x: 400, y: 180, data: { template: "Based on the following document context, please answer the user's question.\n\nDOCUMENT CONTEXT:\n{document_text}\n\nUSER QUESTION:\n{question}" } },
            { type: 'llm-call', x: 760, y: 180 },
            { type: 'display-value', x: 1100, y: 180 }
        ],
        connections: [
            { from: 0, fromPort: 0, toPortName: 'document_text', to: 2 },
            { from: 1, fromPort: 0, toPortName: 'question', to: 2 },
            { from: 2, fromPort: 0, to: 3, toPort: 1 },
            { from: 3, fromPort: 0, to: 4, toPort: 0 }
        ]
    },
    'visual-storyteller-combined': {
        name: 'Visual Storyteller (Combined Output)',
        nodes: [
            { type: 'text-input', x: 60, y: 60, data: { value: 'A robot finding a flower.' } },
            { type: 'system-prompt', x: 60, y: 260, data: { value: 'Write a short, evocative paragraph describing the scene requested by the user.' } },
            { type: 'llm-call', x: 400, y: 60, data: {} },
            { type: 'image-gen', x: 400, y: 300, data: {} },
            { type: 'code-runner', x: 760, y: 160, data: { code: "return `<h2>The Story:</h2><p>${inputA}</p><h2>The Image:</h2><img src='${inputB}' style='max-width:100%;'/>`;" } },
            { type: 'display-value', x: 1100, y: 160 }
        ],
        connections: [
            { from: 0, fromPort: 0, to: 2, toPort: 1 },
            { from: 1, fromPort: 0, to: 2, toPort: 0 },
            { from: 0, fromPort: 0, to: 3, toPort: 0 },
            { from: 2, fromPort: 0, to: 4, toPort: 0 },
            { from: 3, fromPort: 0, to: 4, toPort: 1 },
            { from: 4, fromPort: 0, to: 5, toPort: 0 }
        ]
    },
    'api-data-processing': {
        name: 'API Data Processing (Example)',
        nodes: [
            { type: 'web-request', x: 60, y: 60, data: { url: 'https://jsonplaceholder.typicode.com/todos/1', method: 'GET' } },
            { type: 'json-parser', x: 400, y: 60, data: { path: 'title' } },
            { type: 'code-runner', x: 700, y: 60, data: { code: 'return inputA.toUpperCase() + "!";' } },
            { type: 'display-value', x: 1000, y: 60 }
        ],
        connections: [ { from: 0, fromPort: 0, to: 1, toPort: 0 }, { from: 1, fromPort: 0, to: 2, toPort: 0 }, { from: 2, fromPort: 0, to: 3, toPort: 0 } ]
    },
    'blank': { name: "Blank Canvas", nodes: [], connections: [] }
};

export function clearCanvas() {
    canvasWrapper.innerHTML = '<svg id="connections-layer"></svg>';
    resetSvgConnections();
    state.nodes = [];
    state.connections = [];
    // PDF viewer state holds canvas refs tied to DOM elements about to be destroyed.
    // Clearing it prevents stale refs from triggering renders against detached canvases.
    state.pdfViewerStates = {};
}

// Handles two serialization formats:
//   - Saved flows (storage.js): connections use {fromNode, toNode, fromPortIndex, toPortIndex}
//   - Predefined modules (MODULES above): connections use {from, to, fromPort, toPort}
// nodeMap handles both: saved flows key by string ID, modules by integer index.
export function loadFlow(flowDefinition, flowName) {
    clearCanvas();

    const nodeMap = {};
    flowDefinition.nodes.forEach(nodeDef => {
        const newNode = createNode(nodeDef.type, nodeDef.x, nodeDef.y, nodeDef.data, nodeDef.id || null);
        if (nodeDef.id === undefined) {
            nodeMap[flowDefinition.nodes.indexOf(nodeDef)] = newNode;
        } else {
            nodeMap[nodeDef.id] = newNode;
        }
    });

    flowDefinition.connections.forEach(c => {
        let fromNode, toNode;
        let fromPortIndex = c.fromPortIndex !== undefined ? c.fromPortIndex : c.fromPort;
        let toPortIndex = c.toPortIndex !== undefined ? c.toPortIndex : c.toPort;

        if (c.fromNode && c.toNode) {
            fromNode = nodeMap[c.fromNode];
            toNode = nodeMap[c.toNode];
        } else {
            fromNode = nodeMap[c.from];
            toNode = nodeMap[c.to];
        }

        if (fromNode && toNode) {
            // toPortName allows module definitions to wire string-formatter ports by variable
            // name rather than index, surviving template edits that reorder ports.
            if (c.toPortName) {
                const dynamicIndex = toNode.inputs.findIndex(input => input.name === c.toPortName);
                if (dynamicIndex !== -1) toPortIndex = dynamicIndex;
            }
            createConnection(fromNode.id, fromPortIndex, toNode.id, toPortIndex);
        }
    });

    updateAllConnections();

    if (flowDefinition.panZoom) {
        Object.assign(state.panZoom, flowDefinition.panZoom);
        updateTransform();
    }
    const label = document.getElementById('modules-btn-label');
    if (label) label.textContent = flowName || "Loaded Flow";

    if (!state.isExecuting) {
        setStatus('ready', 'Ready');
    }
}

export function loadModule(moduleKey) {
    const module = MODULES[moduleKey];
    if (!module) return;
    loadFlow(module, module.name);
}
