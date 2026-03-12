import { state, runButton, autonomousToggle, maxCyclesInput, statusDot, statusText, CYCLE_RESULT, STATEFUL_NODE_TYPES, CYCLE_BREAKER_TYPES } from './state.js';
import { executeNode } from './node-execution.js';
import { setStatus, showToast } from './ui.js';

export function getExecutionOrder() {
    const order = [], visited = new Set(), visiting = new Set();

    function visit(nodeId) {
        if (visited.has(nodeId)) return;

        const currentNode = state.nodes.find(n => n.id === nodeId);
        if (!currentNode) return;

        if (visiting.has(nodeId)) {
            throw new Error("Cycle detected in the flow (non-stateful loop). Execution aborted.");
        }

        visiting.add(nodeId);

        state.connections.filter(c => c.toNode === nodeId).forEach(conn => {
            if (STATEFUL_NODE_TYPES.includes(currentNode.type)) return;
            const sourceNode = state.nodes.find(n => n.id === conn.fromNode);
            if (sourceNode && CYCLE_BREAKER_TYPES.includes(sourceNode.type)) return;
            visit(conn.fromNode);
        });

        visiting.delete(nodeId);
        visited.add(nodeId);
        order.push(nodeId);
    }

    try {
        state.nodes.forEach(node => visit(node.id));
    } catch (error) {
        setStatus('error', "Cycle Detected");
        showToast(error.message, 'error');
        return null;
    }
    return order;
}

export async function executeFlowCycle() {
    // Reset all node states before execution
    state.nodes.forEach(n => {
        // Preserve outputBuffer for nodes that feed directly into a stateful node,
        // so the stateful node can pick up the previous cycle's output.
        const feedsIntoStateful = state.connections.some(c =>
            c.fromNode === n.id &&
            STATEFUL_NODE_TYPES.includes(state.nodes.find(sn => sn.id === c.toNode)?.type)
        );
        if (!STATEFUL_NODE_TYPES.includes(n.type) &&
            !CYCLE_BREAKER_TYPES.includes(n.type) &&
            n.type !== 'conditional-logic' &&
            n.type !== 'ai-evaluator' &&
            !feedsIntoStateful)
        {
            n.outputBuffer = null;
        }
        n.el.classList.remove('error', 'success', 'active', 'paused');
    });
    document.querySelectorAll('.connection-path').forEach(path => path.classList.remove('active'));

    if (!state.isAutonomousMode || state.currentCycleCount <= 1) {
        setStatus('running', 'Analyzing flow...');
    }

    const executionOrder = getExecutionOrder();
    if (!executionOrder) return CYCLE_RESULT.ERROR;

    let cycleStatus = CYCLE_RESULT.SUCCESS;

    try {
        for (const nodeId of executionOrder) {
            if (state.isAutonomousMode && state.stopAutonomousExecution) {
                if (!statusText.textContent.includes('Goal Reached')) {
                    throw new Error("Autonomous execution stopped by user during cycle.");
                }
                break;
            }

            const node = state.nodes.find(n => n.id === nodeId);
            const inputs = new Array(node.inputs.length).fill(undefined);
            const incomingConnections = state.connections.filter(c => c.toNode === nodeId);

            incomingConnections.forEach(conn => {
                const fromNode = state.nodes.find(n => n.id === conn.fromNode);

                if (fromNode.type === 'conditional-logic' || fromNode.type === 'ai-evaluator') {
                    if (fromNode.outputBuffer && typeof fromNode.outputBuffer === 'object' && fromNode.outputBuffer.hasOwnProperty('index')) {
                        if (conn.fromPortIndex === fromNode.outputBuffer.index) {
                            inputs[conn.toPortIndex] = fromNode.outputBuffer.data;
                            document.getElementById(conn.id)?.classList.add('active');
                        }
                    }
                } else if (fromNode.outputBuffer !== null && fromNode.outputBuffer !== undefined) {
                    inputs[conn.toPortIndex] = fromNode.outputBuffer;
                    document.getElementById(conn.id)?.classList.add('active');
                }
            });

            const nodeResult = await executeNode(nodeId, inputs);

            incomingConnections.forEach(conn => {
                const path = document.getElementById(conn.id);
                if (path && path.classList.contains('active')) {
                    path.classList.remove('active');
                }
            });

            if (nodeResult === CYCLE_RESULT.PAUSED_FOR_INPUT) {
                cycleStatus = CYCLE_RESULT.PAUSED_FOR_INPUT;
                break;
            }
        }

        if (cycleStatus === CYCLE_RESULT.SUCCESS && !state.stopAutonomousExecution) {
            if (!state.isAutonomousMode) {
                setStatus('success', 'Flow completed!');
            }
        }
    } catch (e) {
        cycleStatus = CYCLE_RESULT.ERROR;

        if (e.message === 'Dialog cancelled by user.') {
            setStatus('error', 'Flow Cancelled');
            showToast('Flow execution cancelled by user.', 'error');
        } else if (e.message === 'Autonomous execution stopped by user during cycle.') {
            // Status handled by runAutonomousLoop
        } else {
            console.error("Flow execution halted.", e);
            if (!statusDot.classList.contains('error')) {
                setStatus('error', 'Execution Error');
            }
        }
    } finally {
        if (cycleStatus !== CYCLE_RESULT.PAUSED_FOR_INPUT) {
            state.nodes.forEach(n => n.el.classList.remove('paused'));
        }

        if (cycleStatus === CYCLE_RESULT.SUCCESS) {
            state.nodes.forEach(n => {
                if (CYCLE_BREAKER_TYPES.includes(n.type) && n.type !== 'chat-terminal') {
                    n.outputBuffer = null;
                }
                // Don't clear outputBuffer for nodes that feed into a stateful node —
                // the stateful node needs to read this value at the start of the next cycle.
                const feedsIntoStateful = state.connections.some(c =>
                    c.fromNode === n.id &&
                    STATEFUL_NODE_TYPES.includes(state.nodes.find(sn => sn.id === c.toNode)?.type)
                );
                if ((n.type === 'conditional-logic' || n.type === 'ai-evaluator') && !feedsIntoStateful) {
                    n.outputBuffer = null;
                }
            });
        }
    }
    return cycleStatus;
}

async function runAutonomousLoop() {
    while (state.currentCycleCount < state.maxAutonomousCycles && !state.stopAutonomousExecution) {
        state.currentCycleCount++;
        setStatus('running', `Autonomous Cycle ${state.currentCycleCount}/${state.maxAutonomousCycles}`);

        const result = await executeFlowCycle();

        if (state.stopAutonomousExecution) break;

        if (result === CYCLE_RESULT.ERROR) {
            console.log(`Autonomous run stopped due to error on cycle ${state.currentCycleCount}.`);
            break;
        }

        if (result === CYCLE_RESULT.PAUSED_FOR_INPUT) {
            console.log(`Autonomous run paused for user input (Cycle ${state.currentCycleCount}).`);
            break;
        }

        if (state.currentCycleCount < state.maxAutonomousCycles && !state.stopAutonomousExecution) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    if (state.stopAutonomousExecution && !statusText.textContent.includes('Goal Reached')) {
        setStatus('ready', 'Run stopped by user.');
    } else if (state.currentCycleCount >= state.maxAutonomousCycles) {
        setStatus('success', `Autonomous run completed (${state.maxAutonomousCycles} cycles).`);
    }
}

export async function startExecution() {
    if (state.isExecuting) {
        if (state.isAutonomousMode) {
            state.stopAutonomousExecution = true;
            setStatus('running', 'Stopping autonomous run...');
            runButton.disabled = true;
        }
        return;
    }

    state.isExecuting = true;
    state.stopAutonomousExecution = false;
    state.currentCycleCount = 0;

    if (state.isAutonomousMode) {
        runButton.innerHTML = '<span class="material-symbols-outlined">stop</span>Stop Flow';
        runButton.style.backgroundColor = 'var(--danger-color)';
        autonomousToggle.disabled = true;
        maxCyclesInput.disabled = true;
        await runAutonomousLoop();
    } else {
        runButton.disabled = true;
        await executeFlowCycle();
    }

    if (statusText.textContent.includes('Awaiting')) {
        // Paused for input, keep isExecuting true
    } else {
        state.isExecuting = false;
        runButton.disabled = false;
        autonomousToggle.disabled = false;
        maxCyclesInput.disabled = false;
        runButton.innerHTML = '<span class="material-symbols-outlined">play_arrow</span>Run Flow';
        runButton.style.backgroundColor = 'var(--button-primary-bg)';
    }
}
