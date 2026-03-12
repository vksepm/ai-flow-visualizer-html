import { state, canvas, canvasWrapper } from './state.js';
import { updateAllConnections } from './connections.js';
import { CYCLE_BREAKER_TYPES } from './state.js';

const NODE_WIDTH = 320;  // matches CSS --default-node-width
const H_GAP = 80;        // horizontal gap between columns
const V_GAP = 40;        // vertical gap between nodes in same column
const PADDING = 100;     // canvas-edge padding

/**
 * Assigns each node a column index equal to its longest dependency path
 * from any source node. Back-edges originating from CYCLE_BREAKER nodes
 * are skipped so cycles don't inflate columns.
 */
function computeColumns(nodes, connections) {
    const colMap = new Map();

    function getCol(nodeId, stack) {
        if (colMap.has(nodeId)) return colMap.get(nodeId);
        if (stack.has(nodeId)) return 0; // cycle guard — return 0 for back-edges

        stack.add(nodeId);

        const incoming = connections.filter(c => {
            if (c.toNode !== nodeId) return false;
            // Skip edges from CYCLE_BREAKER sources to avoid infinite recursion
            const src = nodes.find(n => n.id === c.fromNode);
            return !src || !CYCLE_BREAKER_TYPES.includes(src.type);
        });

        const col = incoming.length === 0
            ? 0
            : Math.max(...incoming.map(c => getCol(c.fromNode, stack) + 1));

        stack.delete(nodeId);
        colMap.set(nodeId, col);
        return col;
    }

    nodes.forEach(n => getCol(n.id, new Set()));
    return colMap;
}

export function autoLayoutFlow() {
    if (state.nodes.length === 0) return;

    const colMap = computeColumns(state.nodes, state.connections);

    // Group nodes by column
    const columns = new Map();
    state.nodes.forEach(n => {
        const col = colMap.get(n.id) ?? 0;
        if (!columns.has(col)) columns.set(col, []);
        columns.get(col).push(n);
    });

    // Lay out each column
    const sortedCols = [...columns.keys()].sort((a, b) => a - b);

    let x = PADDING;
    for (const colIdx of sortedCols) {
        const colNodes = columns.get(colIdx);
        let y = PADDING;

        for (const node of colNodes) {
            node.el.style.left = `${x}px`;
            node.el.style.top  = `${y}px`;
            y += (node.el.offsetHeight || 200) + V_GAP;
        }

        x += NODE_WIDTH + H_GAP;
    }

    updateAllConnections();
    panToFit();
}

/**
 * Adjusts pan so all nodes are centred in the visible viewport.
 */
function panToFit() {
    const nodes = state.nodes;
    if (nodes.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
        const l = parseFloat(n.el.style.left) || 0;
        const t = parseFloat(n.el.style.top)  || 0;
        const w = n.el.offsetWidth  || NODE_WIDTH;
        const h = n.el.offsetHeight || 200;
        if (l       < minX) minX = l;
        if (t       < minY) minY = t;
        if (l + w   > maxX) maxX = l + w;
        if (t + h   > maxY) maxY = t + h;
    });

    const s = state.panZoom.scale;
    const vw = canvas.clientWidth;
    const vh = canvas.clientHeight;

    state.panZoom.x = vw / 2 - ((minX + maxX) / 2) * s;
    state.panZoom.y = vh / 2 - ((minY + maxY) / 2) * s;

    canvasWrapper.style.transform =
        `translate(${state.panZoom.x}px, ${state.panZoom.y}px) scale(${s})`;
}
