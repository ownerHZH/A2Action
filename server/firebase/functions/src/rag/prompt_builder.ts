import type { ScoredTool, ToolSelectionContext } from './types.js';

const JSON_INSTRUCTION = `
Respond in strict JSON:
{
  "reply": "short natural language message",
  "toolPlan": [ { "actionId": "...", "arguments": { } } ],
  "toolCall": { "actionId": "...", "arguments": { } }
}
If no action is needed set toolPlan to [] and toolCall to null.
Use toolPlan for multi-step execution.
`.trim();

export function buildDynamicSystemPrompt(
  scoredTools: ScoredTool[],
  locale: string,
  context: ToolSelectionContext,
  topK: number = 6,
): string {
  const platform = (context.platform ?? 'unknown').toLowerCase();
  const tools = scoredTools.slice(0, Math.max(1, topK));
  const toolLines = tools
    .map((tool) => {
      let guidance = tool.def.guidance;
      if (platform === 'ios' && tool.def.guidance_ios) guidance = tool.def.guidance_ios;
      if (platform === 'android' && tool.def.guidance_android) guidance = tool.def.guidance_android;
      const score = tool.score.toFixed(2);
      return `- ${tool.id} (score ${score}${tool.reason ? ` • ${tool.reason}` : ''}): ${guidance}`;
    })
    .join('\n');

  return [
    JSON_INSTRUCTION,
    'You may only call actions from the list below.',
    `AVAILABLE ACTIONS (Top matches):\n${toolLines}`,
    `Reply in the user's language (${locale}).`,
  ].join('\n\n');
}
