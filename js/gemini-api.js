import { state, DEFAULT_ENV_MODEL } from './state.js';

export function getLLMConfig(nodeSpecificModel = null) {
    const apiKey = state.userGeminiApiKey;

    if (!apiKey) {
        throw new Error('No Gemini API key configured. Open Settings (gear icon) to add your API key.');
    }

    const modelId = nodeSpecificModel || state.globalDefaultModel;
    const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/';

    return {
        apiKey,
        modelId,
        url: `${baseUrl}${modelId}:generateContent?key=${apiKey}`
    };
}

export async function callGeminiAPI(prompt, jsonSchema = null, modelOverride = null) {
    const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }]
    };

    if (jsonSchema) {
        payload.generationConfig = {
            responseMimeType: "application/json",
            responseSchema: jsonSchema
        };
    }

    const config = getLLMConfig(modelOverride);
    const apiUrl = config.url;

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
            const errBody = await response.json();
            if (errBody?.error?.message) errorMessage = errBody.error.message;
        } catch (_) {}
        throw new Error(`Gemini API Error (${config.modelId}): ${errorMessage}`);
    }

    const result = await response.json();

    if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
        const textOutput = result.candidates[0].content.parts[0].text;
        if (jsonSchema) {
            try {
                return JSON.parse(textOutput);
            } catch (e) {
                console.error("Raw API output:", textOutput);
                throw new Error("Failed to parse structured JSON response from API.");
            }
        }
        return textOutput.trim();
    } else {
        console.error("API Response Structure:", result);
        throw new Error('No content returned from LLM.');
    }
}
