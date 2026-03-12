import { state, aiChatDialog, chatMessages, chatInput } from './state.js';
import { NODE_DEFINITIONS } from './node-definitions.js';
import { createNode } from './node-creation.js';
import { createConnection, updateAllConnections } from './connections.js';
import { getLLMConfig } from './gemini-api.js';
import { clearCanvas } from './modules.js';
import { updateNode } from './node-initializers.js';

export function toggleChat(show) {
    const isVisible = aiChatDialog.classList.contains('show');
    if (show === undefined ? !isVisible : show) {
        aiChatDialog.classList.add('show');
        if (chatMessages.children.length === 0) {
            addChatMessage("Hello! I'm your AI Flow Assistant. You can ask me to build flows like 'Create a flow that takes text input and generates an image.'", "assistant");
        }
        chatInput.focus();
    } else {
        aiChatDialog.classList.remove('show');
    }
}

function addChatMessage(text, sender, isThinking = false) {
    const messageEl = document.createElement('div');
    messageEl.classList.add('chat-message', sender);
    if (isThinking) {
        messageEl.classList.add('thinking');
        messageEl.innerHTML = '<span></span><span></span><span></span>';
    } else {
        messageEl.innerHTML = marked.parse(text);
    }
    chatMessages.appendChild(messageEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return messageEl;
}

export async function handleChatSubmit(e) {
    e.preventDefault();
    const userInput = chatInput.value.trim(); if (!userInput) return;
    addChatMessage(userInput, 'user');
    state.chatHistory.push({ role: 'user', parts: [{ text: userInput }] });
    chatInput.value = '';
    const thinkingEl = addChatMessage('', 'assistant', true);
    await getAssistantResponse(thinkingEl);
}

// Returns a minimal structural snapshot for the LLM's context window.
// Intentionally omits outputBuffer and internalState — runtime values
// are irrelevant to layout decisions and would inflate the prompt.
function getCanvasState() {
    return {
        nodes: state.nodes.map(n => ({ id: n.id, type: n.type, position: { x: n.el.offsetLeft, y: n.el.offsetTop }, data: n.data })),
        connections: state.connections
    };
}

function applyCanvasChanges(args) {
    if (args.clear_first) clearCanvas();
    // idMap translates the LLM's temporary string IDs (e.g. "node_1") to the
    // runtime IDs assigned by createNode(). Connections reference LLM IDs
    // and must be remapped before calling createConnection().
    const idMap = {};
    if (args.nodes_to_create) {
        args.nodes_to_create.forEach(nodeDef => {
            const newNode = createNode(nodeDef.type, nodeDef.x, nodeDef.y, nodeDef.data || {});
            if (newNode) idMap[nodeDef.id] = newNode.id;
        });
    }
    if (args.nodes_to_update) args.nodes_to_update.forEach(updateDef => updateNode(updateDef.id, updateDef.data));
    if (args.connections_to_create) {
        args.connections_to_create.forEach(connDef => {
            const fromNodeId = idMap[connDef.from_node_id] || connDef.from_node_id;
            const toNodeId = idMap[connDef.to_node_id] || connDef.to_node_id;
            if(state.nodes.some(n => n.id === fromNodeId) && state.nodes.some(n => n.id === toNodeId)) {
                createConnection(fromNodeId, connDef.from_port_index, toNodeId, connDef.to_port_index);
            }
        });
    }
    updateAllConnections();
}

async function getAssistantResponse(thinkingEl) {
    const NODE_DATA_SCHEMAS = {
        'text-input': { value: 'string (The static text input or initial prompt)' },
        'system-prompt': { value: 'string (MANDATORY: Instructions defining the LLM role, constraints, and output format)' },
        'string-formatter': { template: 'string (Template with {variables})' },
        'math-operation': { op: 'string (add|subtract|etc.)', a: 'number', b: 'number' },
        'json-parser': { path: 'string (e.g., data[0].name)' },
        'code-runner': { code: 'string (JS code. Use inputA, inputB. Must `return`.)' },
        'web-request': { url: 'string', method: 'string (GET|POST)' },
        'text-classification': { categories: 'string (Newline separated categories)' },
        'json-extractor': { schema: 'string (JSON schema definition)' },
        'conditional-logic': { op: 'string (equals|contains|etc.)', valueB: 'string' },
        'ai-evaluator': { criteria: 'string (Rules for PASS/FAIL judgment)'}
    };

    // Build a compact node reference for the system prompt. NODE_DEFINITIONS.description
    // alone doesn't describe the `data` key shapes the LLM must populate, so
    // NODE_DATA_SCHEMAS supplements it with the config object structure.
    const conciseDefs = {};
    Object.entries(NODE_DEFINITIONS).forEach(([key, value]) => {
        let description = `[${key}] ${value.title}: ${value.description}`;
        const schema = NODE_DATA_SCHEMAS[key];
        if (schema) {
            description += ` | REQUIRED CONFIG (data): ${JSON.stringify(schema)}`;
        }
        conciseDefs[key] = description;
    });

    const nodeDefinitionsString = Object.entries(conciseDefs).map(([key, desc]) => `- ${desc}`).join('\n');

    const systemPrompt = `You are an expert AI flow assistant. Use the 'update_canvas' tool to build and configure flows based on user requests.

## Instructions:
1. Analyze the request and design the flow (nodes and connections).
2. **CONFIGURATION IS MANDATORY:** If a node requires configuration (see 'REQUIRED CONFIG (data)' below), you MUST provide the 'data' object when calling 'update_canvas'.
   Example: To create a translator agent, you MUST configure 'system-prompt': { "type": "system-prompt", ..., "data": { "value": "Act as a translator..." } }
3. Layout: Flows move left-to-right. Start near x:50, y:50. Space nodes ~350px apart horizontally.

## Autonomous Agents & Loops (CRITICAL):
The engine forbids direct cycles (e.g., LLM -> LLM). To create autonomous agents or feedback loops (e.g., using 'ai-evaluator' for self-correction), you MUST use 'history-manager' to break the cycle.

**Correct Autonomous Loop Pattern:**
1. LLM Output -> Evaluator Input (or next step).
2. Evaluator (Fail/Feedback) -> History Manager (Input 0: Append).
3. History Manager (Output 0: History Array) -> LLM (Input 2: Context/History).
4. Use 'stop-signal' connected to Evaluator (Pass) to define the goal.

## Available Nodes & Configuration:
${nodeDefinitionsString}

## Current canvas state:
${JSON.stringify(getCanvasState(), null, 2)}`;

    const tools = [{ functionDeclarations: [{ name: "update_canvas", description: "Modifies the canvas by creating/updating nodes and connections.", parameters: { type: "OBJECT", properties: {
        clear_first: { type: "BOOLEAN", description: "If true, clears the canvas before adding new elements. Use this for new requests." },
        nodes_to_create: { type: "ARRAY", items: { type: "OBJECT", properties: {
            id: { type: "STRING", description: "Temporary ID for referencing in connections" },
            type: { type: "STRING" },
            x: { type: "NUMBER" },
            y: { type: "NUMBER" },
            data: { type: "OBJECT", description: "Configuration data for the node (see schema in system prompt)" }
        }}},
        nodes_to_update: { type: "ARRAY", items: { type: "OBJECT", properties: {
            id: { type: "STRING", description: "Existing Node ID" },
            data: { type: "OBJECT" }
        }}},
        connections_to_create: { type: "ARRAY", items: { type: "OBJECT", properties: {
            from_node_id: { type: "STRING" },
            from_port_index: { type: "NUMBER" },
            to_node_id: { type: "STRING" },
            to_port_index: { type: "NUMBER" }
        }}}
    }}}] }];

    const assistantConfig = getLLMConfig();
    const apiUrl = assistantConfig.url;

    const payload = { contents: [ ...state.chatHistory ], tools: tools, systemInstruction: { parts: [{ text: systemPrompt }] } };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error("API Error Response Body:", errorBody);
            if (errorBody.includes("context_length_exceeded") || response.status === 400) {
                throw new Error(`API Error: Prompt might be too long or complex (${response.status}). Try a simpler request.`);
            }
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();

        thinkingEl.remove();
        const candidate = result.candidates?.[0];

        if (!candidate?.content?.parts) {
            console.error("Invalid or empty response from AI:", result);
            if (candidate?.finishReason === 'SAFETY' || result.promptFeedback?.blockReason === 'SAFETY') {
                throw new Error("AI response blocked by safety filters.");
            }
            throw new Error("Invalid response structure from AI.");
        }

        let assistantResponseText = "I've made the requested changes.";
        let toolCallMade = false;
        candidate.content.parts.forEach(part => {
            if (part.functionCall?.name === 'update_canvas') {
                applyCanvasChanges(part.functionCall.args);
                toolCallMade = true;
            }
        });

        const textPart = candidate.content.parts.find(p => p.text);
        if (textPart) assistantResponseText = textPart.text;
        else if (!toolCallMade) assistantResponseText = "I couldn't determine how to modify the canvas from that. Could you rephrase?";

        addChatMessage(assistantResponseText, 'assistant');
        // Push the full candidate.content (not just text) because Gemini's multi-turn
        // function-calling protocol requires the assistant turn — including any
        // functionCall parts — to appear verbatim in the next request's history.
        state.chatHistory.push(candidate.content);
    } catch (err) {
        console.error("Assistant API error:", err);
        thinkingEl.remove();
        addChatMessage(`Sorry, I encountered an error: ${err.message}.`, "assistant");
    }
}
