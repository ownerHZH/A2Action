# A2Action Tool‑RAG (RAG 2.0) — Architecture

## Goal

Reliably map “natural language intent” to “client‑executable Actions”, while keeping the system scalable as:

- the tool catalog grows
- languages grow
- platform differences grow

Core properties:

- low latency and low token cost (Top‑K dynamic injection)
- multilingual robustness (embeddings)
- safety and control (client allowlist + server filtering)
- multi‑step automation (toolPlan)

## The three critical pieces

### 1) Client: capability catalog

The client registers Actions and exports a lightweight catalog to the backend:

- `id`: unique actionId / toolId
- `name` / `summary`: human readable descriptions
- `arguments`: argument schema (optional)

The backend must only plan within the **client‑declared actionId allowlist**.

### 2) Server: Tool‑RAG hybrid scoring

Tool‑RAG selection is typically a hybrid score (the demo implements a minimal version):

- **VectorScore**: cosine similarity between query embedding and tool embedding
- **ContextScore**: “stickiness” via `lastActiveToolId` (fixes short replies like “yes / continue / ok”)
- **HeuristicScore**: strong boosts from attachments / special patterns (e.g., image, m3u)

Then take Top‑K and generate the dynamic tool prompt.

### 3) Dynamic prompt injection (Top‑K tools only)

The server injects only the Top‑K tool guidance into the system prompt, and enforces a strict JSON output contract:

```json
{
  "reply": "short message",
  "toolPlan": [{ "actionId": "...", "arguments": {} }],
  "toolCall": { "actionId": "...", "arguments": {} }
}
```

After the model responds, the server filters toolCall/toolPlan again against the allowlist.

## Assets and configuration

- `server/firebase/functions/src/tools/registry.json`: tool semantics and guidance (`embedding_text` / `guidance` / `signals`)
- `server/firebase/functions/src/tools/tool_vectors.json`: build‑time generated tool vectors
- `npm --prefix server/firebase/functions run build:tool-vectors`: generate vectors (default is offline toy embedding; you can switch to a remote embeddings provider)

## Production hardening (out of scope for this demo)

- tracing and metrics (selection hit rate, execution failure rate, latency distribution)
- argument schema validation (e.g., JSON schema / zod‑style validation)
- structured result cards (better UI rendering and replay)
- toolPlan interruption / rollback rules (permission denied, user cancel, partial failure)
