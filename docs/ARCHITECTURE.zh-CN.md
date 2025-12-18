# A2Action Tool‑RAG (RAG 2.0) 架构说明

## 目标

把 “自然语言意图” 稳定映射到 “客户端可执行的 Actions”，并在工具规模、语言数量、平台差异不断增长的情况下，仍保持：

- 低延迟、低 token 成本（Top‑K 动态注入）
- 多语言鲁棒（Embedding 语义匹配）
- 可控安全（白名单动作 + 服务端过滤）
- 可链式编排（toolPlan）

## 三件关键事

### 1) 客户端：能力目录（Capability Catalog）

客户端注册 Actions，并导出给后端：

- `id`：唯一 actionId（也就是 toolId）
- `name/summary`：人类可读说明
- `arguments`：参数 schema（可选）

后端只会在 **客户端声明支持的 actionId 集合** 内做规划。

### 2) 服务端：Tool‑RAG 混合检索与排序

Tool‑RAG 的得分通常是混合策略（Demo 也实现了最简版）：

- **VectorScore**：用户输入 embedding 与 tool embedding 的余弦相似度
- **ContextScore**：`lastActiveToolId` 粘性加权（解决“好的/继续/确认”这类短回复）
- **HeuristicScore**：附件/特殊 URL 的强规则加权（如 image、m3u）

最终取 Top‑K 生成动态 Prompt，只注入最相关的工具说明。

### 3) 动态 Prompt 注入（Top‑K tools only）

后端把 Top‑K 的工具说明（guidance）拼成 system prompt，并要求模型 **严格 JSON 输出**：

```json
{
  "reply": "short message",
  "toolPlan": [{ "actionId": "...", "arguments": {} }],
  "toolCall": { "actionId": "...", "arguments": {} }
}
```

然后服务端对模型结果再做一次 allowlist 过滤（只允许调用客户端声明的 actionId）。

## 配置与资产

- `server/firebase/functions/src/tools/registry.json`：工具语义与指导文本（embedding_text / guidance / signals）
- `server/firebase/functions/src/tools/tool_vectors.json`：build‑time 生成的工具向量
- `npm --prefix server/firebase/functions run build:tool-vectors`：生成 tool_vectors（默认 toy embedding，可切换 DashScope）

## 生产化建议（不在 Demo 范围）

- 统一的 traceId/metrics（命中率、误触发率、耗时分布）
- 工具参数的 schema 校验（zod / jsonschema）
- 结果卡片结构化（方便 UI 渲染与回放）
- toolPlan 的中断/回滚策略（权限失败、用户取消等）
