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

    const tension = 0.6;
    const controlOffset = Math.max(50, Math.abs(end.x - start.x) * tension);
    const controlX1 = start.x + controlOffset;
    const controlX2 = end.x - controlOffset;

    path.setAttribute('d', `M ${start.x} ${start.y} C ${controlX1} ${start.y}, ${controlX2} ${end.y}, ${end.x} ${end.y}`);
}

export function updateAllConnections() {
    state.connections.forEach(c => {
        const start = document.getElementById(c.fromPortId);
        const end = document.getElementById(c.toPortId);
        if (start && end) {
            const currentPath = document.getElementById(c.id);
            const isActive = currentPath ? currentPath.classList.contains('active') : false;
            drawConnection(c.id, getPortCoords(start), getPortCoords(end), isActive ? 'active' : '');
        }
    });
}

export function createConnection(fromNodeId, fromPortIndex, toNodeId, toPortIndex) {
    const fromPortId = `${fromNodeId}_out_${fromPortIndex}`;
    const toPortId = `${toNodeId}_in_${toPortIndex}`;
    const connId = `conn_${fromNodeId}_${fromPortIndex}_to_${toNodeId}_${toPortIndex}`;

    if (state.connections.some(c => c.id === connId)) return;

    state.connections.push({ id: connId, fromNode: fromNodeId, fromPortIndex, fromPortId, toNode: toNodeId, toPortIndex, toPortId });
}

export function deleteConnection(connectionId) {
    const index = state.connections.findIndex(c => c.id === connectionId);
    if (index > -1) {
        state.connections.splice(index, 1);
        document.getElementById(connectionId)?.remove();
    }
}

function selectConnection(e, connectionId) {
    e.stopPropagation();
    document.querySelectorAll('.connection-path.selected').forEach(p => p.classList.remove('selected'));

    state.selectedConnectionId = connectionId;
    const path = document.getElementById(connectionId);
    if (path) path.classList.add('selected');
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
        return;
    }

    const toPortId = `${endNode.id}_in_${endPortIndex}`;

    if (state.connections.some(c => c.toPortId === toPortId)) {
        showToast("Input port is already connected.", "error");
        return;
    }

    createConnection(state.connectionStartPort.node.id, state.connectionStartPort.portIndex, endNode.id, endPortIndex);

    document.getElementById('potential-connection')?.remove();
    updateAllConnections();
    state.isConnecting = false;
}
