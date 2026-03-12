import { state, runButton, zoomInBtn, zoomOutBtn, snapGridBtn, settingsBtn,
         modulesDropdownBtn, modulesDropdownContent, saveFlowBtn, loadFlowBtn,
         exportFlowBtn, importFlowBtn, autonomousToggle, maxCyclesInput,
         aiChatFab, closeChatBtn, chatForm, MIN_ZOOM, MAX_ZOOM } from './state.js';
import { populateNodeLibrary, showSettingsModal } from './ui.js';
import { setupCanvasEventListeners, updateTransform } from './canvas.js';
import { deleteConnection } from './connections.js';
import { startExecution } from './execution-engine.js';
import { MODULES, loadModule } from './modules.js';
import { saveFlow, showLoadFlowDialog, exportFlow, importFlow } from './storage.js';
import { toggleChat, handleChatSubmit } from './assistant.js';

// Sorts modules alphabetically, always placing 'blank' last.
function populateModulesMenu() {
    modulesDropdownContent.innerHTML = '';
    const sortedKeys = Object.keys(MODULES).sort((a, b) => {
        if (a === 'blank') return 1;
        if (b === 'blank') return -1;
        return MODULES[a].name.localeCompare(MODULES[b].name);
    });

    for (const key of sortedKeys) {
        const module = MODULES[key];
        const btn = document.createElement('button');
        btn.textContent = module.name;
        btn.onclick = () => { loadModule(key); modulesDropdownContent.style.display = 'none'; };
        modulesDropdownContent.appendChild(btn);
    }
}

function init() {
    // Restore settings from localStorage
    const savedApiKey = localStorage.getItem('aiflow_settings_apiKey');
    const savedModel = localStorage.getItem('aiflow_settings_defaultModel');
    if (savedApiKey) state.userGeminiApiKey = savedApiKey;
    if (savedModel) state.globalDefaultModel = savedModel;

    populateNodeLibrary();
    populateModulesMenu();

    // Load the reflection loop by default
    loadModule('reflection-agent-loop');
    // Default to autonomous mode to match the reflection-agent-loop example,
    // which requires multiple cycles to converge.
    autonomousToggle.checked = true;
    state.isAutonomousMode = true;

    updateTransform();
    setupCanvasEventListeners();

    // --- Event Listeners ---

    runButton.addEventListener('click', startExecution);

    zoomInBtn.addEventListener('click', () => { state.panZoom.scale = Math.min(MAX_ZOOM, state.panZoom.scale * 1.2); updateTransform(); });
    zoomOutBtn.addEventListener('click', () => { state.panZoom.scale = Math.max(MIN_ZOOM, state.panZoom.scale / 1.2); updateTransform(); });

    snapGridBtn.addEventListener('click', () => {
        state.snapToGrid = !state.snapToGrid;
        snapGridBtn.classList.toggle('active', state.snapToGrid);
    });

    settingsBtn.addEventListener('click', showSettingsModal);

    modulesDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = modulesDropdownContent.style.display === 'block';
        if (!isOpen) {
            const rect = modulesDropdownBtn.getBoundingClientRect();
            modulesDropdownContent.style.top = rect.bottom + 4 + 'px';
            modulesDropdownContent.style.left = rect.left + 'px';
        }
        modulesDropdownContent.style.display = isOpen ? 'none' : 'block';
    });
    document.addEventListener('click', (e) => {
        if (!modulesDropdownBtn.contains(e.target)) {
            modulesDropdownContent.style.display = 'none';
        }
    });

    saveFlowBtn.addEventListener('click', saveFlow);
    loadFlowBtn.addEventListener('click', showLoadFlowDialog);
    exportFlowBtn.addEventListener('click', exportFlow);
    importFlowBtn.addEventListener('click', importFlow);

    autonomousToggle.addEventListener('change', () => {
        state.isAutonomousMode = autonomousToggle.checked;
    });
    maxCyclesInput.addEventListener('change', () => {
        state.maxAutonomousCycles = parseInt(maxCyclesInput.value) || 5;
    });

    aiChatFab.addEventListener('click', () => toggleChat(true));
    closeChatBtn.addEventListener('click', () => toggleChat(false));
    chatForm.addEventListener('submit', handleChatSubmit);

    // Connection deletion via keyboard
    document.addEventListener('keydown', (e) => {
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
        if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedConnectionId) {
            deleteConnection(state.selectedConnectionId);
            state.selectedConnectionId = null;
        }
    });
}

init();
