# A2Action 协议（Client ↔ Server）

本 Demo 使用 Firebase Callable：`a2actionOrchestrator`。

## Request

```ts
{
  locale?: string,
  prompt?: string,
  messages?: Array<{ role: "user"|"assistant"|"system", content: string }>,
  temperature?: number,
  context?: {
    platform?: "ios"|"android"|"web",
    ragMode?: "legacy.v1"|"rag.v2",
    lastActiveToolId?: string,
    capabilities?: Array<{
      id: string,
      name?: string,
      summary?: string,
      arguments?: Record<string, unknown>
    }>,
    clientCapabilityIds?: string[],
    attachments?: Array<{ name?: string, kind?: string, mimeType?: string }>
  }
}
```

## Response

```ts
{
  locale: string,
  content: string,
  usage?: any,
  toolCall: { actionId: string, arguments: Record<string, any> } | null,
  toolPlan: Array<{ actionId: string, arguments: Record<string, any> }>
}
```

## 语义约束（建议）

- `toolPlan` 用于多步；单步优先用 `toolCall`
- 若无需动作：`toolCall=null` 且 `toolPlan=[]`
- actionId 必须来自 `clientCapabilityIds`（服务端会过滤不在白名单的调用）
