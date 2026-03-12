import { state, toastEl, statusDot, statusText, nodeLibraryList, GEMINI_MODELS, DEFAULT_ENV_MODEL } from './state.js';
import { NODE_DEFINITIONS } from './node-definitions.js';

let toastTimeout;

export function showToast(message, type = 'info') {
    toastEl.textContent = message;
    toastEl.className = `toast show ${type}`;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

export function setStatus(statusState, text) {
    statusDot.className = `status-dot ${statusState}`;
    statusText.textContent = text;
}

export function showModalDialog(title, message, showInput = true) {
    return new Promise((resolve, reject) => {
        const dialogId = `modal-dialog-${Date.now()}`;

        let existingDialog = document.getElementById(dialogId);
        if (existingDialog) existingDialog.remove();

        const dialog = document.createElement('div');
        dialog.id = dialogId;
        dialog.className = 'modal-dialog';

        const closeDialog = () => {
            if (document.body.contains(dialog)) document.body.removeChild(dialog);
        };

        dialog.innerHTML = `
            <h3>${title}</h3>
            <p>${message}</p>
            ${showInput ? `<input type="text" id="${dialogId}-input" placeholder="Enter value..." style="background-color: var(--input-bg); border: 1px solid var(--input-border); color: var(--primary-text); border-radius: 4px; padding: 8px; font-family: var(--font-ui); font-size: 1em; width: 100%;">` : ''}
            <div class="modal-actions">
                <button id="${dialogId}-cancel-btn" class="btn-cancel">Cancel</button>
                <button id="${dialogId}-confirm-btn" class="btn-confirm">${showInput ? 'Submit' : 'OK'}</button>
            </div>
        `;

        document.body.appendChild(dialog);

        const input = dialog.querySelector(`#${dialogId}-input`);
        if (input) input.focus();

        dialog.querySelector(`#${dialogId}-confirm-btn`).addEventListener('click', () => {
            const value = input ? input.value.trim() : true;
            resolve(value);
            closeDialog();
        });

        dialog.querySelector(`#${dialogId}-cancel-btn`).addEventListener('click', () => {
            reject('Dialog cancelled by user.');
            closeDialog();
        });

        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') dialog.querySelector(`#${dialogId}-confirm-btn`).click();
                else if (e.key === 'Escape') dialog.querySelector(`#${dialogId}-cancel-btn`).click();
            });
        }
    });
}

export function showSettingsModal() {
    const dialogId = `modal-settings-${Date.now()}`;
    const dialog = document.createElement('div');
    dialog.id = dialogId;
    dialog.className = 'modal-dialog';
    dialog.style.width = '500px';

    let modelOptions = GEMINI_MODELS.map(m =>
        `<option value="${m.id}" ${m.id === state.globalDefaultModel ? 'selected' : ''}>${m.name}</option>`
    ).join('');

    dialog.innerHTML = `
        <h3>LLM Settings</h3>
        <p>Configure your Gemini API Key and default model. If no key is provided, the default environment model (${DEFAULT_ENV_MODEL}) will be used.</p>

        <label style="font-size: 0.9em; color: var(--secondary-text); margin-top: 16px; display: block;">Gemini API Key (Optional):</label>
        <input type="text" id="${dialogId}-api-key" placeholder="Enter your Gemini API Key" value="${state.userGeminiApiKey}" style="background-color: var(--input-bg); border: 1px solid var(--input-border); color: var(--primary-text); border-radius: 4px; padding: 8px; font-family: var(--font-ui); font-size: 1em; width: 100%; box-sizing: border-box;">

        <label style="font-size: 0.9em; color: var(--secondary-text); margin-top: 16px; display: block;">Default Model:</label>
        <select id="${dialogId}-model-select" style="background-color: var(--input-bg); border: 1px solid var(--input-border); color: var(--primary-text); border-radius: 4px; padding: 8px; font-family: var(--font-ui); font-size: 1em; width: 100%; box-sizing: border-box;">
            ${modelOptions}
        </select>

        <div class="modal-actions" style="margin-top: 20px;">
            <button id="${dialogId}-cancel-btn" class="btn-cancel">Cancel</button>
            <button id="${dialogId}-save-btn" class="btn-confirm">Save Settings</button>
        </div>
    `;

    document.body.appendChild(dialog);

    const closeDialog = () => {
        if (document.body.contains(dialog)) document.body.removeChild(dialog);
    };

    dialog.querySelector(`#${dialogId}-cancel-btn`).addEventListener('click', closeDialog);
    dialog.querySelector(`#${dialogId}-save-btn`).addEventListener('click', () => {
        const newApiKey = dialog.querySelector(`#${dialogId}-api-key`).value.trim();
        const newModel = dialog.querySelector(`#${dialogId}-model-select`).value;

        state.userGeminiApiKey = newApiKey;
        state.globalDefaultModel = newModel;

        // Persist settings to localStorage
        localStorage.setItem('aiflow_settings_apiKey', newApiKey);
        localStorage.setItem('aiflow_settings_defaultModel', newModel);

        showToast("Settings saved successfully!", "success");
        closeDialog();
    });
}

export function populateNodeLibrary() {
    nodeLibraryList.innerHTML = '';
    const categories = {};

    for (const type in NODE_DEFINITIONS) {
        const def = NODE_DEFINITIONS[type];
        const category = def.category || 'Uncategorized';
        if (!categories[category]) categories[category] = [];
        categories[category].push({ type, ...def });
    }

    const orderedCategories = ['Inputs/Media', 'User Interaction', 'AI/Logic', 'Logic', 'Text Processing', 'Integrations', 'Utilities', 'Data Processing', 'Output'];

    orderedCategories.forEach(categoryName => {
        if (!categories[categoryName]) return;

        const header = document.createElement('div');
        header.className = 'category-header';
        header.innerHTML = `<span>${categoryName}</span><span class="material-symbols-outlined">expand_less</span>`;

        const content = document.createElement('div');
        content.className = 'category-content';

        header.addEventListener('click', () => {
            content.classList.toggle('collapsed');
            header.querySelector('.material-symbols-outlined').textContent = content.classList.contains('collapsed') ? 'expand_more' : 'expand_less';
        });

        categories[categoryName].forEach(def => {
            const card = document.createElement('div');
            card.className = 'node-card';
            card.draggable = true;
            card.innerHTML = `<span class="material-symbols-outlined">${def.icon}</span> <span>${def.title}</span>`;
            card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', def.type); });
            content.appendChild(card);
        });

        nodeLibraryList.appendChild(header);
        nodeLibraryList.appendChild(content);
    });
}
