# A2Action Protocol (Client ↔ Server)

This demo uses a Firebase Callable function: `a2actionOrchestrator`.

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

## Recommended semantics

- Use `toolPlan` for multi‑step sequences; use `toolCall` for single‑step
- If no tool is needed: `toolCall = null` and `toolPlan = []`
- `actionId` must come from `context.clientCapabilityIds` (the server filters anything outside the allowlist)
