# A2Action Server (Firebase Functions) Demo

Location: `server/firebase/functions/`

Includes:

- callable: `a2actionOrchestrator`
- Tool‑RAG (RAG 2.0) core: `src/rag/*`
- tool registry & vectors: `src/tools/registry.json`, `src/tools/tool_vectors.json`
- vector build script: `npm run build:tool-vectors`

Recommended: run end‑to‑end with Functions Emulator + `A2ACTION_MOCK_MODE=router` first (no external model key required).

Docs:

- root: `README.en.md`
- deployment: `docs/DEPLOYMENT.en.md`

中文版本：`README.md`
