import { state, CYCLE_RESULT, STATEFUL_NODE_TYPES, CYCLE_BREAKER_TYPES } from './state.js';
import { NODE_DEFINITIONS } from './node-definitions.js';
import { getLLMConfig, callGeminiAPI } from './gemini-api.js';
import { renderDisplayValueContent, extractTextFromPDF } from './display.js';
import { showToast, setStatus, showModalDialog } from './ui.js';
import { addMessageToChatUI, runStringFormatter, calculateMath } from './node-initializers.js';

// Helper for JSON path
const getDeep = (obj, path) => {
    const keys = path.replace(/\[(\w+)\]/g, '.$1').split('.');
    let result = obj;
    for (const key of keys) {
        result = result ? result[key] : undefined;
        if (result === undefined) return undefined;
    }
    return result;
};

export async function executeNode(nodeId, inputData) {
    const node = state.nodes.find(n => n.id === nodeId);
    if (!node) return CYCLE_RESULT.SUCCESS;

    node.el.classList.remove('error', 'success', 'paused');
    node.el.classList.add('active');

    if (!state.isAutonomousMode) {
        setStatus('running', `Running: ${NODE_DEFINITIONS[node.type].title}`);
    }

    node.inputBuffer = inputData;

    try {
        let output = null;
        switch(node.type) {

            // --- Inputs/Media ---
            case 'text-input': case 'system-prompt':
                output = node.el.querySelector('.node-value').value; break;
            case 'file-upload':
                if (node.internalState.fileData) {
                    if (node.internalState.fileData.mimeType === 'application/pdf') {
                        output = await extractTextFromPDF(node.internalState.fileData.data);
                    } else { output = node.internalState.fileData; }
                }
                break;
            case 'webcam-capture':
                output = node.internalState.imageData;
                if (!output && inputData.length === 0) showToast("Webcam Capture node has no captured image.", "error");
                break;
            case 'audio-recorder': output = node.internalState.audioData; if (!output && inputData.length === 0) showToast("Audio Recorder node has no recording.", "error"); break;
            case 'drawing-canvas':
                output = node.el.querySelector('.node-drawing-canvas').toDataURL('image/png');
                break;

            // --- User Interaction ---
            case 'chat-interface': {
                const agentResponse = inputData[0];
                if (agentResponse !== undefined && agentResponse !== null && agentResponse !== "") {
                    addMessageToChatUI(node, String(agentResponse), 'agent');
                }

                if (state.isAutonomousMode && node.outputBuffer === null) {
                    node.el.classList.remove('active');
                    node.el.classList.add('paused');
                    setStatus('running', 'Paused: Awaiting User Input (Chat Interface)...');
                    return CYCLE_RESULT.PAUSED_FOR_INPUT;
                }

                output = node.outputBuffer;
                break;
            }

            case 'chat-terminal': {
                const agentMessage = inputData[0] !== undefined && inputData[0] !== null ? inputData[0] : "(Agent did not respond)";
                let history = "";
                if (Array.isArray(inputData[1])) {
                    history = inputData[1].join('\n');
                } else if (inputData[1]) {
                    history = String(inputData[1]);
                }

                node.el.querySelector('.node-output-preview').textContent = agentMessage;

                let promptMessage = "";
                if (history) {
                    promptMessage += "--- CHAT HISTORY ---\n" + history + "\n----------------------\n\n";
                }
                promptMessage += "Agent: " + agentMessage + "\n\n(Enter your response below)";

                node.el.classList.remove('active');
                node.el.classList.add('paused');
                setStatus('running', 'Awaiting Chat Input (Modal)...');

                if (state.isAutonomousMode) {
                    return CYCLE_RESULT.PAUSED_FOR_INPUT;
                }

                output = await showModalDialog("Chat Terminal Interaction", promptMessage, true);

                node.el.classList.remove('paused');
                node.el.classList.add('active');
                state.isExecuting = true;
                setStatus('running', `Running: ${NODE_DEFINITIONS[node.type].title}`);
                break;
            }

            // --- Text Processing ---
            case 'summarization':
                if (!inputData[0]) throw new Error("Summarization requires input text.");
                output = await callGeminiAPI(`Please provide a concise summary of the following text:\n\n---\n${inputData[0]}\n---\n\nSUMMARY:`, null, node.data.model);
                node.el.querySelector('.node-output-preview').textContent = output.substring(0, 200) + (output.length > 200 ? '...' : '');
                break;

            case 'sentiment-analysis': {
                if (!inputData[0]) throw new Error("Sentiment Analysis requires input text.");
                const sentimentSchema = {
                    type: "OBJECT",
                    properties: {
                        sentiment: { type: "STRING", description: "Overall sentiment (e.g., Positive, Negative, Neutral)" },
                        score: { type: "NUMBER", description: "Confidence score from 0.0 to 1.0" }
                    },
                    required: ["sentiment", "score"]
                };
                output = await callGeminiAPI(`Analyze the sentiment of the following text. Respond strictly according to the required JSON schema.\n\nTEXT:\n${inputData[0]}`, sentimentSchema, node.data.model);
                node.el.querySelector('.node-output-preview').textContent = JSON.stringify(output, null, 2);
                break;
            }

            case 'text-classification': {
                if (!inputData[0]) throw new Error("Text Classification requires input text.");
                if (!node.data.categories) throw new Error("Text Classification requires categories to be defined.");
                const categories = node.data.categories.split('\n').map(c => c.trim()).filter(c => c.length > 0);
                if (categories.length === 0) throw new Error("No valid categories defined for classification.");
                output = await callGeminiAPI(`Classify the following text into exactly one of the categories listed below. Respond ONLY with the name of the category.\n\nCATEGORIES:\n${categories.join('\n')}\n\nTEXT:\n${inputData[0]}\n\nCATEGORY:`, null, node.data.model);
                if (!categories.map(c => c.toLowerCase()).includes(output.toLowerCase())) {
                    console.warn("LLM returned a classification not strictly in the list:", output);
                }
                break;
            }

            case 'json-extractor': {
                if (!inputData[0]) throw new Error("JSON Extractor requires input text.");
                if (!node.data.schema) throw new Error("JSON Extractor requires a JSON schema.");
                let userSchema;
                try {
                    const schemaDef = JSON.parse(node.data.schema);
                    userSchema = {
                        type: "OBJECT",
                        properties: Object.fromEntries(Object.entries(schemaDef).map(([key, type]) => [key, { type: String(type).toUpperCase() }])),
                        required: Object.keys(schemaDef)
                    };
                } catch (e) {
                    throw new Error("Invalid JSON Schema format provided in node configuration.");
                }
                output = await callGeminiAPI(`Extract structured data from the following text according to the provided JSON schema. Ensure the output strictly adheres to the schema.\n\nTEXT:\n${inputData[0]}`, userSchema, node.data.model);
                break;
            }

            // --- Utilities & Data Processing ---
            case 'string-formatter': output = runStringFormatter(node, inputData); break;

            case 'history-manager': {
                if (!node.internalState.buffer) node.internalState.buffer = [];
                if (inputData[0] !== undefined && inputData[0] !== null) {
                    let historyEntry = inputData[0];
                    if (typeof inputData[0] === 'object' && inputData[0].text) {
                        historyEntry = inputData[0].text;
                    }
                    if (historyEntry !== "") {
                        node.internalState.buffer.push(historyEntry);
                    }
                }
                output = [...node.internalState.buffer];
                const countPre = node.el.querySelector('.history-count');
                if (countPre) countPre.textContent = node.internalState.buffer.length;
                break;
            }

            case 'math-operation': {
                const valA_input = node.el.querySelector('.math-value-a'), valB_input = node.el.querySelector('.math-value-b');
                const valA = inputData[0] !== undefined ? parseFloat(inputData[0]) : parseFloat(valA_input.value);
                const valB = inputData[1] !== undefined ? parseFloat(inputData[1]) : parseFloat(valB_input.value);
                valA_input.value = valA; valB_input.value = valB;
                output = calculateMath(valA, valB, node.el.querySelector('.math-op-select').value);
                node.el.querySelector('.node-output-preview').textContent = output; break;
            }

            case 'json-parser': {
                if (!inputData[0]) throw new Error("JSON Parser requires input.");
                const path = node.data.path;
                if (!path) throw new Error("JSON Parser requires a path.");
                let jsonObject;
                try {
                    jsonObject = typeof inputData[0] === 'string' ? JSON.parse(inputData[0]) : inputData[0];
                } catch (e) {
                    throw new Error("Invalid JSON input format.");
                }
                output = getDeep(jsonObject, path);
                const preview = node.el.querySelector('.node-output-preview');
                preview.textContent = typeof output === 'object' ? JSON.stringify(output, null, 2) : String(output);
                break;
            }

            case 'code-runner': {
                const code = node.data.code;
                if (!code) throw new Error("Code Runner has no script.");
                const inputA = inputData[0];
                const inputB = inputData[1];
                try {
                    const userFunc = new Function('inputA', 'inputB', code);
                    output = userFunc(inputA, inputB);
                } catch (e) {
                    throw new Error(`JavaScript execution error: ${e.message}`);
                }
                break;
            }

            // --- AI/Logic ---
            case 'ai-evaluator': {
                const inputToEvaluate = inputData[0];
                if (inputToEvaluate === undefined || inputToEvaluate === null) throw new Error("AI Evaluator requires 'Input to Evaluate'.");
                let criteria = inputData[1];
                if (criteria === undefined || criteria === null || criteria === "") {
                    criteria = node.data.criteria;
                }
                if (!criteria) throw new Error("AI Evaluator requires criteria (either via Input 1 or configuration).");

                const evaluationPrompt = `Evaluate the INPUT based on the CRITERIA. Respond strictly according to the JSON schema: {verdict: 'PASS'|'FAIL', feedback: 'string'}. If the verdict is 'FAIL', provide constructive feedback on how the input failed the criteria.

CRITERIA:
${criteria}

INPUT:
${typeof inputToEvaluate === 'object' ? JSON.stringify(inputToEvaluate) : String(inputToEvaluate)}`;

                const evaluationSchema = {
                    type: "OBJECT",
                    properties: {
                        verdict: { type: "STRING", enum: ["PASS", "FAIL"], description: "The result of the evaluation." },
                        feedback: { type: "STRING", description: "Constructive feedback if verdict is FAIL, otherwise empty." }
                    },
                    required: ["verdict", "feedback"]
                };

                const evaluationResult = await callGeminiAPI(evaluationPrompt, evaluationSchema, node.data.model);

                if (evaluationResult.verdict === 'PASS') {
                    output = { index: 0, data: inputToEvaluate };
                } else if (evaluationResult.verdict === 'FAIL') {
                    output = { index: 1, data: evaluationResult.feedback || "Evaluation Failed (No feedback provided)." };
                } else {
                    throw new Error(`Evaluator LLM returned invalid verdict: ${evaluationResult.verdict}.`);
                }
                break;
            }

            case 'llm-call': {
                const parts = [];

                if (inputData[1] !== undefined && inputData[1] !== null) {
                    if (typeof inputData[1] === 'object' && (inputData[1].text || inputData[1].media)) {
                        if (inputData[1].text) parts.push({text: inputData[1].text});
                        if (inputData[1].media) {
                            if (inputData[1].media.mimeType === 'application/pdf') {
                                const pdfText = await extractTextFromPDF(inputData[1].media.data);
                                parts.push({ text: `\n\n[Attached PDF Content]:\n${pdfText}\n[End PDF Content]\n` });
                            } else {
                                parts.push({ inlineData: { mimeType: inputData[1].media.mimeType, data: inputData[1].media.data } });
                            }
                        }
                    } else if (typeof inputData[1] === 'string') {
                        parts.push({text: inputData[1]});
                    }
                }

                if (inputData[2] !== undefined && inputData[2] !== null) {
                    if (typeof inputData[2] === 'string' && inputData[2].startsWith('data:')) {
                        const [mimeHeader, data] = inputData[2].split(',');
                        const mimeType = mimeHeader.split(':')[1].split(';')[0];
                        parts.push({ inlineData: { mimeType: mimeType, data: data } });
                    } else if (typeof inputData[2] === 'object' && inputData[2].data && inputData[2].mimeType) {
                        parts.push({ inlineData: { mimeType: inputData[2].mimeType, data: inputData[2].data } });
                    } else if (Array.isArray(inputData[2])) {
                        const historyContext = inputData[2].join('\n');
                        if (historyContext.trim() !== "") {
                            parts.push({ text: `\n\n--- Conversation History/Context/Feedback ---\n${historyContext}\n--- End History/Context/Feedback ---` });
                        }
                    } else if (typeof inputData[2] === 'string') {
                        parts.push({ text: `\n\n--- Context ---\n${inputData[2]}\n--- End Context ---` });
                    }
                }

                if (parts.length === 0) {
                    console.log("LLM Call skipped: No User Prompt or Context/Media provided.");
                    output = null;
                    break;
                }

                const payload = { contents: [{ role: "user", parts: parts }] };
                if (inputData[0]) payload.contents.unshift({role: "user", parts: [{text: inputData[0]}]}, {role: "model", parts: [{text: "Understood."}]});

                const llmConfig = getLLMConfig(node.data.model);
                const apiUrl = llmConfig.url;

                const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                if (!response.ok) {
                    let errorMessage = `HTTP ${response.status}`;
                    try {
                        const errBody = await response.json();
                        if (errBody?.error?.message) errorMessage = errBody.error.message;
                    } catch (_) {}
                    throw new Error(`Gemini API Error (${llmConfig.modelId}): ${errorMessage}`);
                }
                const result = await response.json();
                if (result.candidates?.[0]?.content) output = result.candidates[0].content.parts[0].text;
                else throw new Error('No content returned from LLM.');
                node.el.querySelector('.node-output-preview').textContent = output.substring(0, 200) + (output.length > 200 ? '...' : '');
                break;
            }

            case 'image-gen': {
                if (!inputData[0]) throw new Error("Image Gen requires a prompt input.");
                const imgPayload = { instances: [{ prompt: inputData[0] }], parameters: { "sampleCount": 1} };
                const apiKey = state.userGeminiApiKey || "";
                const imgResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(imgPayload) });
                if (!imgResponse.ok) {
                    let errorMessage = `HTTP ${imgResponse.status}`;
                    try {
                        const errBody = await imgResponse.json();
                        if (errBody?.error?.message) errorMessage = errBody.error.message;
                    } catch (_) {}
                    throw new Error(`Image API Error: ${errorMessage}`);
                }
                const imgResult = await imgResponse.json();
                if (imgResult.predictions?.[0]?.bytesBase64Encoded) {
                    output = `data:image/png;base64,${imgResult.predictions[0].bytesBase64Encoded}`;
                } else throw new Error('No image returned from API.');
                const imgPreview = node.el.querySelector('.node-output-preview');
                imgPreview.src = output; imgPreview.style.display = 'block';
                break;
            }

            // --- Logic/Flow Control ---
            case 'conditional-logic': {
                const inputA_cond = inputData[0];
                const valueB = node.data.valueB;
                const operator = node.data.op;
                let conditionMet = false;
                const numA = parseFloat(inputA_cond);
                const numB = parseFloat(valueB);
                const strA = String(inputA_cond);
                const strB = String(valueB);

                switch (operator) {
                    case 'equals': conditionMet = strA === strB; break;
                    case 'not_equals': conditionMet = strA !== strB; break;
                    case 'contains': conditionMet = strA.includes(strB); break;
                    case 'not_contains': conditionMet = !strA.includes(strB); break;
                    case 'gt': conditionMet = (!isNaN(numA) && !isNaN(numB)) ? numA > numB : strA > strB; break;
                    case 'lt': conditionMet = (!isNaN(numA) && !isNaN(numB)) ? numA < numB : strA < strB; break;
                    case 'is_empty': conditionMet = inputA_cond === undefined || inputA_cond === null || strA === ''; break;
                }

                output = {
                    index: conditionMet ? 0 : 1,
                    data: inputA_cond
                };
                break;
            }

            case 'stop-signal':
                if (inputData[0] !== undefined && inputData[0] !== null) {
                    if (state.isAutonomousMode) {
                        state.stopAutonomousExecution = true;
                        setStatus('success', 'Goal Reached (Stop Signal)!');
                        showToast("Autonomous flow completed by Stop Signal.", "success");
                    }
                }
                output = null;
                break;

            // --- Integrations ---
            case 'web-request': {
                const { url, method, headers: headerStr } = node.data;
                if (!url) throw new Error("Web Request URL is missing.");
                let fetchOptions = { method: method || 'GET' };
                let requestHeaders = {};
                if (headerStr) {
                    try { requestHeaders = JSON.parse(headerStr); } catch (e) { throw new Error("Invalid JSON format in Headers."); }
                }
                fetchOptions.headers = requestHeaders;
                if (inputData[0] && (method === 'POST' || method === 'PUT')) {
                    fetchOptions.body = typeof inputData[0] === 'object' ? JSON.stringify(inputData[0]) : String(inputData[0]);
                }
                const webResponse = await fetch(url, fetchOptions);
                if (!webResponse.ok) throw new Error(`HTTP error! status: ${webResponse.status}`);
                const contentType = webResponse.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                    output = await webResponse.json();
                } else {
                    output = await webResponse.text();
                }
                break;
            }

            case 'web-search': {
                const query = inputData[0];
                if (!query) throw new Error("Web Search requires a query.");
                output = await callGeminiAPI(`Simulate a web search engine result for the following query. Provide a concise summary (3-5 key points or paragraphs) of the most relevant information available about this topic as if summarizing top search results. Do not include personal opinions or conversational filler. Query: "${query}"`, null, node.data.model);
                node.el.querySelector('.node-output-preview').textContent = output.substring(0, 200) + (output.length > 200 ? '...' : '');
                break;
            }

            // --- Output ---
            case 'display-value':
                renderDisplayValueContent(node.el.querySelector('.node-value'), inputData[0]);
                output = inputData[0];
                break;
        }

        // Store output
        if (node.type === 'conditional-logic' || node.type === 'ai-evaluator') {
            node.outputBuffer = output;
        } else if ((!STATEFUL_NODE_TYPES.includes(node.type) && !CYCLE_BREAKER_TYPES.includes(node.type)) || output !== null) {
            node.outputBuffer = output;
        }

        node.el.classList.add('success');
        return CYCLE_RESULT.SUCCESS;

    } catch(e) {
        console.error(`Execution failed for node ${nodeId} (${node.type}):`, e);
        if (e.message !== 'Dialog cancelled by user.') {
            const nodeTitle = NODE_DEFINITIONS[node.type]?.title || node.type;
            setStatus('error', `Error in ${nodeTitle}`);
            node.el.classList.add('error');
            showToast(`Error in ${nodeTitle}: ${e.message}`, 'error');
        }
        throw e;
    } finally {
        if (!node.el.classList.contains('paused')) {
            node.el.classList.remove('active');
        }
    }
}
