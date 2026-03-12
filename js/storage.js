import { state } from './state.js';
import { showToast, setStatus, showModalDialog } from './ui.js';
import { loadFlow } from './modules.js';

const STORAGE_PREFIX = 'aiflow_';

// Serializes only structural state: positions, types, config data.
// Runtime state (outputBuffer, internalState, el) is intentionally excluded —
// it is meaningless across sessions and would bloat saved files.
export function serializeFlow() {
    return {
        nodes: state.nodes.map(n => ({
            id: n.id,
            type: n.type,
            x: n.el.offsetLeft,
            y: n.el.offsetTop,
            data: n.data
        })),
        connections: state.connections.map(c => ({
            id: c.id,
            fromNode: c.fromNode,
            fromPortIndex: c.fromPortIndex,
            fromPortId: c.fromPortId,
            toNode: c.toNode,
            toPortIndex: c.toPortIndex,
            toPortId: c.toPortId
        })),
        panZoom: { ...state.panZoom },
        createdAt: new Date().toISOString()
    };
}

// --- Save to localStorage ---
export async function saveFlow() {
    try {
        const name = await showModalDialog("Save Flow", "Enter a name for this flow:", true);
        if (!name) {
            showToast("Save cancelled — no name provided.", "error");
            return;
        }

        const flowData = serializeFlow();
        localStorage.setItem(STORAGE_PREFIX + name, JSON.stringify(flowData));
        showToast(`Flow "${name}" saved to browser storage!`, "success");
    } catch (e) {
        // User cancelled the dialog
        if (e === 'Dialog cancelled by user.') return;
        console.error("Error saving flow:", e);
        showToast("Failed to save flow.", "error");
    }
}

// --- Load from localStorage ---
export function showLoadFlowDialog() {
    setStatus('running', 'Loading saved flows...');

    // Enumerate all saved flows
    const savedFlows = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(STORAGE_PREFIX) && !key.startsWith('aiflow_settings_')) {
            const name = key.substring(STORAGE_PREFIX.length);
            try {
                const data = JSON.parse(localStorage.getItem(key));
                savedFlows.push({ name, data, createdAt: data.createdAt || null });
            } catch (e) {
                console.warn(`Skipping invalid flow data for key: ${key}`);
            }
        }
    }

    if (savedFlows.length === 0) {
        showToast("No saved flows found in browser storage.", "error");
        if (!state.isExecuting) setStatus('ready', 'Ready');
        return;
    }

    savedFlows.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
    });

    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';
    dialog.style.width = '500px';

    let listHtml = `
        <h3>Select a Flow to Load</h3>
        <div style="max-height: 60vh; overflow-y: auto; margin-bottom: 20px;">`;

    savedFlows.forEach(flow => {
        const date = flow.createdAt ? new Date(flow.createdAt).toLocaleString() : 'N/A';
        listHtml += `<div class="load-flow-item" data-flow-name="${flow.name}" style="padding: 12px; border-radius: 8px; cursor: pointer; border-bottom: 1px solid var(--node-border); display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong style="color: var(--primary-text);">${flow.name}</strong>
                            <br><small style="color: var(--secondary-text);">Saved: ${date}</small>
                        </div>
                        <button class="delete-saved-flow-btn" data-flow-name="${flow.name}" title="Delete" style="background: none; border: none; color: var(--secondary-text); cursor: pointer; padding: 4px;">
                            <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
                        </button>
                    </div>`;
    });

    listHtml += `</div><div class="modal-actions"><button id="close-load-dialog" class="btn-cancel">Cancel</button></div>`;

    dialog.innerHTML = listHtml;
    document.body.appendChild(dialog);

    dialog.querySelectorAll('.delete-saved-flow-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const flowName = btn.dataset.flowName;
            localStorage.removeItem(STORAGE_PREFIX + flowName);
            btn.closest('.load-flow-item').remove();
            showToast(`Flow "${flowName}" deleted.`, "success");
            // If no flows remain, close dialog
            if (dialog.querySelectorAll('.load-flow-item').length === 0) {
                document.body.removeChild(dialog);
                showToast("No saved flows remaining.", "error");
            }
        });
    });

    dialog.querySelectorAll('.load-flow-item').forEach(item => {
        item.addEventListener('mouseenter', () => item.style.backgroundColor = 'var(--button-hover-bg)');
        item.addEventListener('mouseleave', () => item.style.backgroundColor = 'transparent');
        item.addEventListener('click', (e) => {
            if (e.target.closest('.delete-saved-flow-btn')) return; // Don't load when clicking delete
            const flowName = e.currentTarget.dataset.flowName;
            const flowData = savedFlows.find(f => f.name === flowName);
            if (flowData) {
                loadFlow(flowData.data, flowName);
            }
            document.body.removeChild(dialog);
        });
    });

    dialog.querySelector('#close-load-dialog').addEventListener('click', () => document.body.removeChild(dialog));

    if (!state.isExecuting) {
        setStatus('ready', 'Ready');
    }
}

// --- Export as JSON file ---
export function exportFlow() {
    const flowData = serializeFlow();
    const json = JSON.stringify(flowData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-flow-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast("Flow exported as JSON file!", "success");
}

// --- Import from JSON file ---
export function importFlow() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const flowData = JSON.parse(event.target.result);
                if (!flowData.nodes || !flowData.connections) {
                    throw new Error("Invalid flow file structure.");
                }
                loadFlow(flowData, file.name.replace('.json', ''));
                showToast(`Flow imported from "${file.name}"!`, "success");
            } catch (err) {
                console.error("Import error:", err);
                showToast(`Failed to import flow: ${err.message}`, "error");
            }
        };
        reader.readAsText(file);
    });

    input.click();
}
