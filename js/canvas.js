import { state, canvas, canvasWrapper, MIN_ZOOM, MAX_ZOOM } from './state.js';
import { updateAllConnections, drawConnection, getPortCoords, clearPortHighlights } from './connections.js';
import { NODE_DEFINITIONS } from './node-definitions.js';
import { createNode } from './node-creation.js';

export function updateTransform() {
    canvasWrapper.style.transform = `translate(${state.panZoom.x}px, ${state.panZoom.y}px) scale(${state.panZoom.scale})`;
}

export function startNodeDrag(e, node) {
    e.stopPropagation();
    state.activeNode = node;
    state.nodeDragStart.x = e.clientX;
    state.nodeDragStart.y = e.clientY;
    node.el.style.zIndex = 20;
    state.nodes.forEach(n => { if (n.id !== node.id) n.el.style.zIndex = 10; });
    if (state.selectedConnectionId) {
        document.getElementById(state.selectedConnectionId)?.classList.remove('selected');
        clearPortHighlights();
        state.selectedConnectionId = null;
    }
}

function startCanvasPan(e) {
    state.isPanning = true;
    state.dragStart.x = e.clientX - state.panZoom.x;
    state.dragStart.y = e.clientY - state.panZoom.y;
    document.body.classList.add('grabbing');
    if (state.selectedConnectionId) {
        document.getElementById(state.selectedConnectionId)?.classList.remove('selected');
        clearPortHighlights();
        state.selectedConnectionId = null;
    }
}

export function setupCanvasEventListeners() {
    canvas.addEventListener('mousedown', (e) => {
        if (e.target.id === 'node-canvas' || e.target.id === 'canvas-wrapper' || e.target.closest('svg#connections-layer')) {
            startCanvasPan(e);
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (state.isPanning) {
            state.panZoom.x = e.clientX - state.dragStart.x;
            state.panZoom.y = e.clientY - state.dragStart.y;
            updateTransform();
        }
        else if (state.activeNode) {
            const dx = (e.clientX - state.nodeDragStart.x) / state.panZoom.scale;
            const dy = (e.clientY - state.nodeDragStart.y) / state.panZoom.scale;

            let newX = state.activeNode.el.offsetLeft + dx;
            let newY = state.activeNode.el.offsetTop + dy;

            state.activeNode.el.style.left = `${newX}px`;
            state.activeNode.el.style.top = `${newY}px`;

            state.nodeDragStart = { x: e.clientX, y: e.clientY };
            updateAllConnections();
        } else if (state.isConnecting) {
            const startCoords = getPortCoords(state.connectionStartPort.el);
            const r = canvas.getBoundingClientRect();
            const endCoords = {
                x: (e.clientX - r.left - state.panZoom.x) / state.panZoom.scale,
                y: (e.clientY - r.top - state.panZoom.y) / state.panZoom.scale
            };
            drawConnection('potential-connection', startCoords, endCoords, 'potential');
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (state.isConnecting) {
            const potential = document.getElementById('potential-connection');
            if (!e.target.classList.contains('io-port') || !e.target.classList.contains('input')) {
                potential?.remove();
            }
        }

        state.isPanning = false;
        state.activeNode = null;
        state.isConnecting = false;
        document.body.classList.remove('grabbing');
    });

    canvas.addEventListener('wheel', (e) => {
        // Don't hijack scroll inside scrollable node content or iframes —
        // let those elements handle their own wheel events.
        if (e.target.closest('.node-chat-messages') || e.target.closest('.display-value-content') || e.target.tagName === 'IFRAME') {
            return;
        }

        e.preventDefault();
        // Plain scroll pans the canvas. Ctrl/Cmd+scroll zooms.
        // On macOS, pinch-to-zoom fires as wheel with ctrlKey=true.
        if (!e.ctrlKey && !e.metaKey) {
            state.panZoom.x -= e.deltaX;
            state.panZoom.y -= e.deltaY;
            updateTransform();
            return;
        }

        const delta = e.deltaY > 0 ? -1 : 1;
        const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.panZoom.scale + delta * 0.1));

        const r = canvas.getBoundingClientRect();
        const mx = e.clientX - r.left;
        const my = e.clientY - r.top;

        // Zoom-to-cursor: adjust pan so the point under the cursor stays fixed.
        // Formula: newPan = cursorPos - (cursorPos - oldPan) * (newScale / oldScale)
        state.panZoom.x = mx - (mx - state.panZoom.x) * (newScale / state.panZoom.scale);
        state.panZoom.y = my - (my - state.panZoom.y) * (newScale / state.panZoom.scale);
        state.panZoom.scale = newScale;
        updateTransform();
    });

    canvas.addEventListener('dragover', (e) => { e.preventDefault(); });
    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        const nodeType = e.dataTransfer.getData('text/plain');
        if (!NODE_DEFINITIONS[nodeType]) return;

        const rect = canvas.getBoundingClientRect();
        // Convert client coords to canvas-space by removing the pan offset
        // and dividing by scale, matching the CSS transform in updateTransform().
        const x = (e.clientX - rect.left - state.panZoom.x) / state.panZoom.scale;
        const y = (e.clientY - rect.top - state.panZoom.y) / state.panZoom.scale;
        createNode(nodeType, x, y);
    });
}
