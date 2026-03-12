// --- DOM References ---
export const canvas = document.getElementById('node-canvas');
export const canvasWrapper = document.getElementById('canvas-wrapper');
export const runButton = document.getElementById('runButton');
export const statusDot = document.getElementById('status-dot');
export const statusText = document.getElementById('status-text');
export const toastEl = document.getElementById('toast');
export const zoomInBtn = document.getElementById('zoom-in');
export const zoomOutBtn = document.getElementById('zoom-out');
export const nodeLibraryList = document.getElementById('node-library-list');
export const modulesDropdownBtn = document.getElementById('modules-dropdown-btn');
export const modulesDropdownContent = document.getElementById('modules-dropdown-content');
export const saveFlowBtn = document.getElementById('save-flow-btn');
export const loadFlowBtn = document.getElementById('load-flow-btn');
export const exportFlowBtn = document.getElementById('export-flow-btn');
export const importFlowBtn = document.getElementById('import-flow-btn');
export const snapGridBtn = document.getElementById('snap-grid-btn');
export const settingsBtn = document.getElementById('settings-btn');
export const autonomousToggle = document.getElementById('autonomous-toggle');
export const maxCyclesInput = document.getElementById('max-cycles-input');

// AI Chat Elements
export const aiChatFab = document.getElementById('ai-chat-fab');
export const aiChatDialog = document.getElementById('ai-chat-dialog');
export const closeChatBtn = document.getElementById('close-chat-btn');
export const chatMessages = document.getElementById('chat-messages');
export const chatForm = document.getElementById('chat-form');
export const chatInput = document.getElementById('chat-input');

// --- Constants ---
export const GRID_SIZE = 20;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 2.5;
export const DEFAULT_ENV_MODEL = 'gemini-3.1-flash-lite-preview';

export const GEMINI_MODELS = [
    { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite (Preview) (Default)' },
    { id: 'gemini-2.0-flash-lite',         name: 'Gemini 2.0 Flash Lite' },
    { id: 'gemini-flash-lite-latest',       name: 'Gemini Flash Lite (Latest)' },
    { id: 'gemini-flash-latest',            name: 'Gemini Flash (Latest)' },
    { id: 'gemini-2.5-flash-lite',          name: 'Gemini 2.5 Flash Lite' },
    { id: 'gemini-2.0-flash',               name: 'Gemini 2.0 Flash' },
    { id: 'gemini-2.5-flash',               name: 'Gemini 2.5 Flash' },
    { id: 'gemini-3.1-pro-preview',         name: 'Gemini 3.1 Pro (Preview)' },
];

export const CYCLE_RESULT = {
    SUCCESS: 'success',
    ERROR: 'error',
    PAUSED_FOR_INPUT: 'paused_for_input'
};

// STATEFUL_NODE_TYPES nodes keep their outputBuffer across cycles and skip
// incoming-edge cycle detection, enabling persistent state (e.g. history accumulation).
// CYCLE_BREAKER_TYPES nodes skip outgoing-edge detection so a user-interaction node
// can sit in a loop without triggering the cycle guard.
export const STATEFUL_NODE_TYPES = ['history-manager'];
export const CYCLE_BREAKER_TYPES = ['chat-terminal', 'chat-interface'];

// --- Mutable State ---
export const state = {
    nodes: [],
    connections: [],
    pdfViewerStates: {},
    chatHistory: [],

    activeNode: null,
    isPanning: false,
    isConnecting: false,
    connectionStartPort: null,
    selectedConnectionId: null,

    isExecuting: false,
    isAutonomousMode: false,
    maxAutonomousCycles: 5,
    currentCycleCount: 0,
    stopAutonomousExecution: false,

    userGeminiApiKey: '',
    globalDefaultModel: DEFAULT_ENV_MODEL,

    snapToGrid: false,

    // Pan/Zoom State
    panZoom: { scale: 1, x: 0, y: 0 },
    dragStart: { x: 0, y: 0 },
    nodeDragStart: { x: 0, y: 0 },

    // Toast timeout handle
    toastTimeout: null,
};
