import { state } from './state.js';

export async function extractTextFromPDF(base64Data) {
    const pdfData = atob(base64Data);
    const pdfDoc = await pdfjsLib.getDocument({data: pdfData}).promise;
    let textContent = '';
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        textContent += (await page.getTextContent()).items.map(s => s.str).join(' ') + '\n';
    }
    return textContent;
}

export function renderDisplayValueContent(element, data) {
    if (!element) return;

    const nodeEl = element.closest('.node');
    const defaultNodeWidth = getComputedStyle(document.documentElement).getPropertyValue('--default-node-width').trim() || '320px';
    const defaultMinHeight = '150px';

    if (nodeEl) {
        nodeEl.style.width = defaultNodeWidth;
        element.style.minHeight = defaultMinHeight;
        nodeEl.classList.remove('expanded-for-html');
    }

    element.innerHTML = '';
    element.classList.remove('rendered-markdown');

    if (data === null || data === undefined) {
        element.textContent = "N/A";
        element.classList.add('rendered-markdown');
        return;
    }

    if (typeof data === 'object' && data.mimeType && data.data) {
        if (data.mimeType === 'application/pdf') { renderPdfInElement(element, `data:application/pdf;base64,${data.data}`, `pdf-viewer-${element.closest('.node').id}`); return; }
        const dataUrl = `data:${data.mimeType};base64,${data.data}`;
        if (data.mimeType.startsWith('image/')) { element.innerHTML = `<img src="${dataUrl}" alt="${data.fileName || 'Image'}">`; return; }
        if (data.mimeType.startsWith('audio/')) { element.innerHTML = `<audio controls src="${dataUrl}" style="width:100%;"></audio>`; return; }
    }

    if (typeof data === 'string' && data.startsWith('data:image')) { element.innerHTML = `<img src="${data}" alt="Generated or Captured Image">`; return; }

    if (typeof data === 'string' || typeof data === 'number') {
        let content = String(data);

        // Strip a single wrapping fenced code block before rendering as markdown.
        // LLMs frequently wrap HTML output in ```html ... ``` even when instructed not to.
        const codeBlockRegex = /^```(?:\w*\n)?([\s\S]*?)```$/;
        const match = content.trim().match(codeBlockRegex);

        if (match && match[1]) {
            content = match[1].trim();
        }

        if (content.trim().toLowerCase().startsWith('<!doctype html>') || content.trim().toLowerCase().startsWith('<html')) {
            if (nodeEl) {
                const expandedWidth = 960;
                const expandedMinHeight = 600;
                nodeEl.style.width = `${expandedWidth}px`;
                element.style.minHeight = `${expandedMinHeight}px`;
                nodeEl.classList.add('expanded-for-html');
            }

            // srcdoc renders HTML in an isolated browsing context — prevents injected
            // scripts from accessing the parent page's DOM or canvas state.
            const iframe = document.createElement('iframe');
            iframe.srcdoc = content;
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.minHeight = element.style.minHeight;
            iframe.style.border = 'none';
            element.appendChild(iframe);
            return;
        }

        element.innerHTML = marked.parse(content, {gfm: true, breaks: true});
        element.classList.add('rendered-markdown');
        return;
    }

    if (typeof data === 'object') {
        if (Array.isArray(data)) {
            const formattedHistory = data.map((item, index) => `[${index + 1}]: ${item}`).join('\n\n');
            element.innerHTML = `<pre>${formattedHistory}</pre>`;
            return;
        }
        element.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`; return;
    }
}

// PDF rendering helpers
function renderPdfInElement(element, pdfDataSource, viewerId) {
    if (!window.pdfjsLib) { element.textContent = "Error: PDF library not loaded."; return; }
    element.innerHTML = `<div class="pdf-controls"><button class="prev-btn">Prev</button><span>Page <span class="page-num">0</span>/<span class="page-count">0</span></span><button class="next-btn">Next</button></div><div class="pdf-canvas-container"><canvas></canvas></div>`;
    const prevBtn = element.querySelector('.prev-btn'), nextBtn = element.querySelector('.next-btn');
    const canvas = element.querySelector('canvas');
    state.pdfViewerStates[viewerId] = { pdfDoc: null, pageNum: 1, pageRendering: false, pageNumPending: null, canvas: canvas, ctx: canvas.getContext('2d') };
    prevBtn.onclick = () => { if (state.pdfViewerStates[viewerId].pageNum > 1) { state.pdfViewerStates[viewerId].pageNum--; queueRenderPage(viewerId); }};
    nextBtn.onclick = () => { if (state.pdfViewerStates[viewerId].pageNum < state.pdfViewerStates[viewerId].pdfDoc.numPages) { state.pdfViewerStates[viewerId].pageNum++; queueRenderPage(viewerId); }};

    pdfjsLib.getDocument(pdfDataSource).promise.then(pdfDoc => {
        state.pdfViewerStates[viewerId].pdfDoc = pdfDoc;
        element.querySelector('.page-count').textContent = pdfDoc.numPages;
        renderPdfPage(viewerId);
    }).catch(err => { console.error("PDF Load Error:", err); element.innerHTML = "Error loading PDF."; });
}

// PDF.js renders one page at a time. queueRenderPage defers the next render
// until the current one finishes, preventing overlapping canvas draws.
function queueRenderPage(viewerId) {
    const pdfState = state.pdfViewerStates[viewerId];
    if (!pdfState.pageRendering) renderPdfPage(viewerId); else pdfState.pageNumPending = pdfState.pageNum;
}

async function renderPdfPage(viewerId) {
    const pdfState = state.pdfViewerStates[viewerId]; if (!pdfState || !pdfState.pdfDoc) return;
    pdfState.pageRendering = true;
    const page = await pdfState.pdfDoc.getPage(pdfState.pageNum);
    const viewport = page.getViewport({ scale: pdfState.canvas.parentElement.clientWidth / page.getViewport({scale: 1}).width });
    pdfState.canvas.height = viewport.height; pdfState.canvas.width = viewport.width;
    await page.render({ canvasContext: pdfState.ctx, viewport: viewport }).promise;
    pdfState.pageRendering = false;
    const controls = pdfState.canvas.closest('.display-value-content').querySelector('.pdf-controls');
    if (controls) {
        controls.querySelector('.page-num').textContent = pdfState.pageNum;
        controls.querySelector('.prev-btn').disabled = pdfState.pageNum <= 1;
        controls.querySelector('.next-btn').disabled = pdfState.pageNum >= pdfState.pdfDoc.numPages;
    }
    if (pdfState.pageNumPending !== null) {
        pdfState.pageNum = pdfState.pageNumPending; pdfState.pageNumPending = null; queueRenderPage(viewerId);
    }
}
