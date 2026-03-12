import { state, canvasWrapper, GRID_SIZE } from './state.js';
import { NODE_DEFINITIONS } from './node-definitions.js';
import { startConnection, endConnection, updateAllConnections } from './connections.js';
import { showToast } from './ui.js';
import { startNodeDrag } from './canvas.js';
import {
    initStringFormatter, initWebcamNode, initAudioNode, initDrawingNode,
    initMathNode, initJsonParserNode, initCodeRunnerNode, initWebRequestNode,
    initTextClassificationNode, initJsonExtractorNode, initConditionalNode,
    initHistoryManagerNode, initChatInterfaceNode, initAIEvaluatorNode,
    initModelSelector, handleFileSelect
} from './node-initializers.js';

export function createNode(type, x, y, data = {}, id = null) {
    const def = NODE_DEFINITIONS[type]; if (!def) return null;
    const nodeId = id || `node_${type}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const node = {
        id: nodeId,
        type,
        inputs: JSON.parse(JSON.stringify(def.inputs || [])),
        outputs: JSON.parse(JSON.stringify(def.outputs || [])),
        data: JSON.parse(JSON.stringify(data)),
        internalState: {},
        outputBuffer: null
    };

    const nodeEl = document.createElement('div');
    nodeEl.className = 'node'; nodeEl.id = nodeId;

    const finalX = state.snapToGrid ? Math.round(x / GRID_SIZE) * GRID_SIZE : x;
    const finalY = state.snapToGrid ? Math.round(y / GRID_SIZE) * GRID_SIZE : y;

    nodeEl.style.left = `${finalX}px`;
    nodeEl.style.top = `${finalY}px`;

    nodeEl.innerHTML = `
        <div class="node-header">
            <div class="node-header-title"><span class="material-symbols-outlined">${def.icon}</span><span>${def.title}</span></div>
            <button class="delete-node-btn"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="node-content">${def.content(node)}</div>`;

    if (nodeEl.querySelector('.output-with-copy')) {
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-output-btn';
        copyBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px;">content_copy</span>';
        copyBtn.title = 'Copy Output';
        copyBtn.addEventListener('click', () => copyNodeOutput(node));
        nodeEl.querySelector('.node-content').appendChild(copyBtn);
    }

    canvasWrapper.appendChild(nodeEl);
    node.el = nodeEl;
    state.nodes.push(node);

    nodeEl.querySelector('.delete-node-btn').addEventListener('click', () => deleteNode(nodeId));
    nodeEl.querySelector('.node-header').addEventListener('mousedown', (e) => startNodeDrag(e, node));

    rebuildNodeIO(node);

    // Type-specific initialization logic
    if (type === 'file-upload') { nodeEl.querySelector(`#file-upload-${nodeId}`).addEventListener('change', (e) => handleFileSelect(e, node)); }
    if (type === 'string-formatter') { initStringFormatter(node); }
    if (type === 'webcam-capture') { initWebcamNode(node); }
    if (type === 'audio-recorder') { initAudioNode(node); }
    if (type === 'drawing-canvas') { initDrawingNode(node); }
    if (type === 'math-operation') { initMathNode(node); }
    if (type === 'json-parser') { initJsonParserNode(node); }
    if (type === 'code-runner') { initCodeRunnerNode(node); }
    if (type === 'web-request') { initWebRequestNode(node); }
    if (type === 'text-classification') { initTextClassificationNode(node); }
    if (type === 'json-extractor') { initJsonExtractorNode(node); }
    if (type === 'conditional-logic') { initConditionalNode(node); }
    if (type === 'history-manager') { initHistoryManagerNode(node); }
    if (type === 'chat-interface') { initChatInterfaceNode(node); }

    if (type === 'ai-evaluator') {
        initAIEvaluatorNode(node);
        initModelSelector(node);
    }
    if (type === 'llm-call') {
        initModelSelector(node);
    }

    return node;
}

export function copyNodeOutput(node) {
    let dataToCopy = node.outputBuffer;

    if (node.type === 'conditional-logic' || node.type === 'ai-evaluator') {
        if (dataToCopy && typeof dataToCopy === 'object' && dataToCopy.hasOwnProperty('data')) {
            dataToCopy = dataToCopy.data;
        }
    }

    if (dataToCopy !== null && dataToCopy !== undefined) {
        let textToCopy;
        if (typeof dataToCopy === 'object') {
            textToCopy = JSON.stringify(dataToCopy, null, 2);
        } else {
            textToCopy = String(dataToCopy);
        }

        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            showToast("Output copied to clipboard!");
        } catch (err) {
            showToast("Failed to copy output.", "error");
        }
        document.body.removeChild(textArea);
    } else {
        showToast("No output available to copy yet.", "error");
    }
}

export function rebuildNodeIO(node) {
    const content = node.el.querySelector('.node-content');

    if (node.el.querySelector('.node-io')) return;

    let ioHtml = '';
    (node.inputs || []).forEach((input, i) => {
        const name = input.label || input.name;
        const tooltip = `${name} (${input.dataType || 'any'})`;
        ioHtml += `<div class="node-io"><div id="${node.id}_in_${i}" class="io-port input" data-port-index="${i}" title="${tooltip}"></div><label class="io-label">${name}</label></div>`;
    });
    (node.outputs || []).forEach((output, i) => {
        const name = output.label || output.name;
        const tooltip = `${name} (${output.dataType || 'any'})`;
        ioHtml += `<div class="node-io"><div id="${node.id}_out_${i}" class="io-port output" data-port-index="${i}" title="${tooltip}"></div><label class="io-label">${name}</label></div>`;
    });
    content.insertAdjacentHTML('beforeend', ioHtml);

    node.el.querySelectorAll('.io-port.output').forEach((portEl) => portEl.addEventListener('mousedown', (e) => startConnection(e, node, parseInt(portEl.dataset.portIndex))));
    node.el.querySelectorAll('.io-port.input').forEach((portEl) => portEl.addEventListener('mouseup', (e) => endConnection(node, parseInt(portEl.dataset.portIndex))));

    updateAllConnections();
}

export function deleteNode(nodeId) {
    const nodeIndex = state.nodes.findIndex(n => n.id === nodeId); if (nodeIndex === -1) return;

    state.connections = state.connections.filter(c => {
        if(c.fromNode === nodeId || c.toNode === nodeId) {
            document.getElementById(c.id)?.remove();
            return false;
        }
        return true;
    });

    state.nodes[nodeIndex].el.remove();
    state.nodes.splice(nodeIndex, 1);
}
