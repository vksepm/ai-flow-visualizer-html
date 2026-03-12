# What Firebase Stores

The only data stored in Firestore is the serialized flow — the visual node graph the user has built. Here's the exact shape from serializeFlow() (line 1643):

```json  
{
  "nodes": [
    {
      "id": "node_llm-call_1718000000000_k4f2m9z",
      "type": "llm-call",
      "x": 400,
      "y": 200,
      "data": { "model": "gemini-1.5-pro-latest" }
    }
  ],
  "connections": [
    {
      "fromNode": "node_text-input_...",
      "fromPortIndex": 0,
      "toNode": "node_llm-call_...",
      "toPortIndex": 1
    }
  ],
  "panZoom": { "x": 0, "y": 0, "scale": 1 },
  "createdAt": "<serverTimestamp>"
}
```
That's it. It's purely structural — node positions, types, configuration data, and wiring. No execution results, no LLM responses, no media blobs are stored.
The node.data field varies per type but is always small config values: a template string, a URL, selected operator, custom JS code, model override,evaluation criteria, etc. Never large binary data.

### Can it be stored in localStorage or exported as text files?

Yes, trivially. There are no blockers:

1. It's plain JSON — `serializeFlow()` returns a plain object with no circular references, no DOM elements, no functions. Everything is strings, numbers, arrays, and nested objects.
2. It's small — A typical flow with 5–10 nodes serializes to roughly 2–5 KB of JSON. Even complex flows would be well under localStorage's ~5 MB limit.
3. The only Firestore-specific part is `createdAt: serverTimestamp()` — this is just a timestamp. For localStorage/file export, you'd replace it with `new Date().toISOString()` or `Date.now()`.
4. `loadFlow()` already accepts a plain object — it doesn't care where the data came from. It takes any object with { nodes, connections, panZoom } and rebuilds the canvas. The same function already handles both Firestore saves (with fromNode/toNode keys) and built-in modules (with index-based from/to keys).

What it would take:
- localStorage: `localStorage.setItem('flow_' + name, JSON.stringify(serializeFlow()))` to save, `JSON.parse(localStorage.getItem(...))` to load. A few lines of code.
- File export: `JSON.stringify(serializeFlow(), null, 2)` → create a Blob → trigger a download link. For import, a file input that reads JSON and calls `loadFlow()`.

Both approaches would work as drop-in alternatives or supplements to Firebase, since the serialization and deserialization are already cleanly separated from the storage layer.