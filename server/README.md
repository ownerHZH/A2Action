# A2Action Server (Firebase Functions) Demo

位置：`server/firebase/functions/`

包含：

- `a2actionOrchestrator`（callable）
- Tool‑RAG (RAG 2.0) 核心：`src/rag/*`
- 工具注册表与向量：`src/tools/registry.json`, `src/tools/tool_vectors.json`
- 生成向量脚本：`npm run build:tool-vectors`

推荐先用本地 Emulator + `A2ACTION_MOCK_MODE=router` 跑通（无需外部模型 Key）。

完整部署步骤请看：
- 仓库根目录 `README.md`
- `docs/DEPLOYMENT.zh-CN.md` / `docs/DEPLOYMENT.en.md`
