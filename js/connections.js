import { state } from './state.js';
import { showToast } from './ui.js';

let svgConnections = document.getElementById('connections-layer');

export function getSvgConnections() {
    return svgConnections;
}

export function resetSvgConnections() {
    svgConnections = document.getElementById('connections-layer');
}


export function getPortCoords(portEl) {
    const node = portEl.closest('.node');
    return {
        x: node.offsetLeft + portEl.offsetLeft + portEl.offsetWidth / 2,
        y: node.offsetTop + portEl.offsetTop + portEl.offsetHeight / 2
    };
}

export function drawConnection(pathId, start, end, status = '') {
    // tension controls the Bezier curve's horizontal pull. 0.6 keeps connections
    // readable even when source and destination are close vertically.
    const tension = 0.6;
    const controlOffset = Math.max(50, Math.abs(end.x - start.x) * tension);
    const controlX1 = start.x + controlOffset;
    const controlX2 = end.x - controlOffset;
    const d = `M ${start.x} ${start.y} C ${controlX1} ${start.y}, ${controlX2} ${end.y}, ${end.x} ${end.y}`;

    // Hit area (wider, transparent — easier to click)
    if (pathId !== 'potential-connection') {
        const hitId = `${pathId}_hit`;
        let hit = document.getElementById(hitId);
        if (!hit) {
            hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            hit.setAttribute('id', hitId);
            hit.setAttribute('class', 'connection-hit-area');
            hit.addEventListener('click', (e) => selectConnection(e, pathId));
            svgConnections.insertBefore(hit, svgConnections.firstChild);
        }
        hit.setAttribute('d', d);
    }

    let path = document.getElementById(pathId);
    if (!path) {
        path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('id', pathId);
        svgConnections.appendChild(path);
        if (pathId !== 'potential-connection') {
            path.addEventListener('click', (e) => selectConnection(e, pathId));
        }
    }
    const isSelected = path.classList.contains('selected');
    path.setAttribute('class', `connection-path ${status} ${isSelected ? 'selected' : ''}`);
    path.setAttribute('d', d);
}

export function updateAllConnections() {
    state.connections.forEach(c => {
        const start = document.getElementById(c.fromPortId);
        const end = document.getElementById(c.toPortId);
        if (start && end) {
            const startCoords = getPortCoords(start);
            const endCoords = getPortCoords(end);
            const currentPath = document.getElementById(c.id);
            const isActive = currentPath ? currentPath.classList.contains('active') : false;
            drawConnection(c.id, startCoords, endCoords, isActive ? 'active' : '');
        }
    });
}

export function createConnection(fromNodeId, fromPortIndex, toNodeId, toPortIndex) {
    const fromPortId = `${fromNodeId}_out_${fromPortIndex}`;
    const toPortId = `${toNodeId}_in_${toPortIndex}`;
    const connId = `conn_${fromNodeId}_${fromPortIndex}_to_${toNodeId}_${toPortIndex}`;

    // connId encodes both endpoints, so an ID check is sufficient to prevent
    // duplicate connections without iterating all port combinations.
    if (state.connections.some(c => c.id === connId)) return;

    state.connections.push({ id: connId, fromNode: fromNodeId, fromPortIndex, fromPortId, toNode: toNodeId, toPortIndex, toPortId });
}

export function deleteConnection(connectionId) {
    const index = state.connections.findIndex(c => c.id === connectionId);
    if (index > -1) {
        if (state.selectedConnectionId === connectionId) clearPortHighlights();
        state.connections.splice(index, 1);
        document.getElementById(connectionId)?.remove();
        document.getElementById(`${connectionId}_hit`)?.remove();
    }
}

export function clearPortHighlights() {
    document.querySelectorAll('.io-port.port-selected').forEach(p => p.classList.remove('port-selected'));
}

function selectConnection(e, connectionId) {
    e.stopPropagation();
    document.querySelectorAll('.connection-path.selected').forEach(p => p.classList.remove('selected'));
    clearPortHighlights();

    state.selectedConnectionId = connectionId;
    const path = document.getElementById(connectionId);
    if (path) path.classList.add('selected');

    const conn = state.connections.find(c => c.id === connectionId);
    if (conn) {
        document.getElementById(conn.fromPortId)?.classList.add('port-selected');
        document.getElementById(conn.toPortId)?.classList.add('port-selected');
    }
}

export function startConnection(e, node, portIndex) {
    e.stopPropagation();
    state.isConnecting = true;
    state.connectionStartPort = { el: e.target, node, portIndex };
    let path = document.getElementById('potential-connection');
    if (!path) {
        path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.id = 'potential-connection';
        svgConnections.appendChild(path);
    }
}

export function endConnection(endNode, endPortIndex) {
    if (!state.isConnecting) return;

    if (state.connectionStartPort.node.id === endNode.id) {
        showToast("Cannot connect a node to itself.", "error");
        document.getElementById('potential-connection')?.remove();
        state.isConnecting = false;
        return;
    }

    const toPortId = `${endNode.id}_in_${endPortIndex}`;

    // Each input port accepts only one connection — multiple inputs would be
    // ambiguous during execution since executeNode expects a single value per slot.
    if (state.connections.some(c => c.toPortId === toPortId)) {
        showToast("Input port is already connected.", "error");
        document.getElementById('potential-connection')?.remove();
        state.isConnecting = false;
        return;
    }

    createConnection(state.connectionStartPort.node.id, state.connectionStartPort.portIndex, endNode.id, endPortIndex);

    document.getElementById('potential-connection')?.remove();
    updateAllConnections();
    state.isConnecting = false;
}
