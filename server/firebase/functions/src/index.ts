import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';
import { selectTools } from './rag/tool_selector.js';
import { buildDynamicSystemPrompt } from './rag/prompt_builder.js';
import registryJson from './tools/registry.json' with { type: 'json' };
import type { ChatMessage, ScoredTool, ToolCall, ToolPlanStep, ToolRegistryItem, ToolSelectionContext } from './rag/types.js';

const registry = registryJson as Record<string, ToolRegistryItem>;

type RagMode = 'legacy.v1' | 'rag.v2';

interface ChatRequestPayload {
  prompt?: unknown;
  messages?: unknown;
  locale?: unknown;
  temperature?: unknown;
  context?: unknown;
}

const apiKeySecret = defineSecret('A2ACTION_API_KEY');

const DEFAULT_MODEL = 'qwen-plus';
const DEFAULT_TIMEOUT_MS = (() => {
  const raw = Number(process.env.A2ACTION_CHAT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 45_000;
})();

const DEFAULT_TEMPERATURE = (() => {
  const raw = Number(process.env.A2ACTION_CHAT_TEMPERATURE);
  if (!Number.isFinite(raw)) return 0.7;
  return Math.min(1, Math.max(0, raw));
})();

const RESOLVED_BASE_URL = (() => {
  const candidate = (process.env.A2ACTION_CHAT_BASE_URL ?? '').trim();
  return candidate.replace(/\/+$/, '');
})();

const RESOLVED_MODEL = (() => {
  const candidate = (process.env.A2ACTION_CHAT_MODEL ?? '').trim();
  return candidate || DEFAULT_MODEL;
})();

const MAX_MESSAGE_LENGTH = 4_000;
const MAX_HISTORY_ITEMS = 12;

function clampText(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_MESSAGE_LENGTH) return trimmed;
  return trimmed.slice(0, MAX_MESSAGE_LENGTH);
}

function normalizeLocale(raw: unknown): string {
  if (typeof raw !== 'string') return 'en';
  const cleaned = raw.trim();
  if (!cleaned) return 'en';
  return cleaned;
}

function safeTemperature(raw: unknown): number {
  if (raw === undefined || raw === null) return DEFAULT_TEMPERATURE;
  const num = Number(raw);
  if (!Number.isFinite(num)) return DEFAULT_TEMPERATURE;
  return Math.min(1, Math.max(0, num));
}

function coerceHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const items: ChatMessage[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const role = (entry as any).role;
    const content = (entry as any).content;
    if ((role !== 'user' && role !== 'assistant' && role !== 'system') || typeof content !== 'string') continue;
    items.push({ role, content: clampText(content) });
    if (items.length >= MAX_HISTORY_ITEMS) break;
  }
  return items;
}

function latestUserText(history: ChatMessage[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') return history[i].content;
  }
  return '';
}

function sanitizeContext(raw: unknown): ToolSelectionContext & { ragMode: RagMode; allowedActionIds: Set<string> } {
  const out: ToolSelectionContext & { ragMode: RagMode; allowedActionIds: Set<string> } = {
    platform: undefined,
    attachments: [],
    lastActiveToolId: undefined,
    clientCapabilityIds: [],
    selectionSeed: undefined,
    ragMode: 'legacy.v1',
    allowedActionIds: new Set<string>(),
  };

  if (!raw || typeof raw !== 'object') {
    return out;
  }

  const platform = (raw as any).platform;
  if (typeof platform === 'string' && platform.trim()) {
    out.platform = platform.trim().toLowerCase();
  }

  const lastActiveToolId = (raw as any).lastActiveToolId;
  if (typeof lastActiveToolId === 'string' && lastActiveToolId.trim()) {
    out.lastActiveToolId = lastActiveToolId.trim();
  }

  const ragMode = (raw as any).ragMode;
  if (ragMode === 'rag.v2' || ragMode === 'legacy.v1') {
    out.ragMode = ragMode;
  }

  const clientCapabilityIds = (raw as any).clientCapabilityIds;
  if (Array.isArray(clientCapabilityIds)) {
    out.clientCapabilityIds = clientCapabilityIds
      .map((v: unknown) => (typeof v === 'string' ? v.trim() : ''))
      .filter((v: string) => v.length > 0)
      .slice(0, 80);
  }

  const attachments = (raw as any).attachments;
  if (Array.isArray(attachments)) {
    out.attachments = attachments
      .filter((a: unknown) => a && typeof a === 'object')
      .slice(0, 8)
      .map((a: any) => ({
        name: typeof a.name === 'string' ? a.name.trim() : undefined,
        kind: typeof a.kind === 'string' ? a.kind.trim() : undefined,
        mimeType: typeof a.mimeType === 'string' ? a.mimeType.trim() : undefined,
      }));
  }

  for (const id of out.clientCapabilityIds) {
    out.allowedActionIds.add(id);
  }

  return out;
}

function interpretModelMessage(raw: string): { text: string; toolCall: ToolCall | null; toolPlan: ToolPlanStep[] } {
  const fallbackText = raw.trim();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { text: fallbackText, toolCall: null, toolPlan: [] };
    }

    const reply = typeof (parsed as any).reply === 'string' ? String((parsed as any).reply).trim() : fallbackText;
    const tool = (parsed as any).toolCall;
    const planRaw = Array.isArray((parsed as any).toolPlan) ? (parsed as any).toolPlan : [];

    const toolPlan = planRaw
      .filter((step: any) => step && typeof step === 'object')
      .map((step: any) => ({
        actionId: typeof step.actionId === 'string' ? step.actionId.trim() : '',
        arguments: step.arguments && typeof step.arguments === 'object' ? step.arguments : {},
      }))
      .filter((step: any) => step.actionId.length > 0);

    let toolCall: ToolCall | null = null;
    if (tool && typeof tool === 'object') {
      const actionId = typeof tool.actionId === 'string' ? tool.actionId.trim() : '';
      const args = tool.arguments && typeof tool.arguments === 'object' ? tool.arguments : {};
      if (actionId.length > 0) {
        toolCall = { actionId, arguments: args };
      }
    }

    return { text: reply, toolCall, toolPlan };
  } catch {
    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start >= 0 && end > start) {
        const candidate = raw.slice(start, end + 1);
        if (candidate && candidate !== raw) {
          return interpretModelMessage(candidate);
        }
      }
    } catch {
      // ignore
    }
    return { text: fallbackText, toolCall: null, toolPlan: [] };
  }
}

function filterToAllowed(
  allowed: Set<string>,
  message: { toolCall: ToolCall | null; toolPlan: ToolPlanStep[] },
): { toolCall: ToolCall | null; toolPlan: ToolPlanStep[] } {
  const toolPlan = message.toolPlan.filter((step) => allowed.has(step.actionId));
  const toolCall = message.toolCall && allowed.has(message.toolCall.actionId) ? message.toolCall : null;
  return { toolCall, toolPlan };
}

function buildBaseSystemPrompt(locale: string, dynamicToolPrompt?: string): string {
  const base = [
    'You are A2Action — an assistant that routes user intent into client-side actions (tools).',
    'Be concise, safe, and predictable.',
    dynamicToolPrompt ? `\n${dynamicToolPrompt}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return `${base}\n\n(Reply language: ${locale})`;
}

function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/\S+/i);
  if (!match) return null;
  return match[0].replace(/[),.]+$/, '');
}

function isCjk(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function buildLocalPlannerOutput(
  messages: ChatMessage[],
  allowedActionIds: Set<string>,
  locale: string,
): { raw: string; content: string; usage: null } {
  const userText = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const normalized = userText.toLowerCase();
  const url = extractFirstUrl(userText);

  const hasScanIntent =
    normalized.includes('scan') ||
    normalized.includes('storage') ||
    normalized.includes('junk') ||
    userText.includes('扫描') ||
    userText.includes('清理');

  const isPlaylistUrl = url != null && (url.toLowerCase().includes('.m3u') || url.toLowerCase().includes('.m3u8'));

  const canScan = allowedActionIds.has('demo.storage.scan.v1');
  const canOpenUrl = allowedActionIds.has('demo.url.open.v1');
  const canOpenPlaylist = allowedActionIds.has('demo.playlist.open.v1');
  const canEcho = allowedActionIds.has('demo.echo.v1');

  const preferChinese = locale.toLowerCase().startsWith('zh') || isCjk(userText);

  const toolPlan: Array<{ actionId: string; arguments: Record<string, any> }> = [];
  let toolCall: { actionId: string; arguments: Record<string, any> } | null = null;
  let reply = preferChinese ? '好的。' : 'Okay.';

  if (hasScanIntent && url != null && canScan && (canOpenPlaylist || canOpenUrl)) {
    toolPlan.push({ actionId: 'demo.storage.scan.v1', arguments: { depth: 3 } });
    if (isPlaylistUrl && canOpenPlaylist) {
      toolPlan.push({ actionId: 'demo.playlist.open.v1', arguments: { url } });
    } else if (canOpenUrl) {
      toolPlan.push({ actionId: 'demo.url.open.v1', arguments: { url } });
    }
    reply = preferChinese ? '我先执行扫描，然后继续处理链接。' : 'I will scan first, then handle the link.';
  } else if (isPlaylistUrl && url != null && canOpenPlaylist) {
    toolCall = { actionId: 'demo.playlist.open.v1', arguments: { url } };
    reply = preferChinese ? '我来打开播放列表。' : 'Opening the playlist.';
  } else if (url != null && canOpenUrl) {
    toolCall = { actionId: 'demo.url.open.v1', arguments: { url } };
    reply = preferChinese ? '我来打开链接。' : 'Opening the link.';
  } else if (hasScanIntent && canScan) {
    toolCall = { actionId: 'demo.storage.scan.v1', arguments: { depth: 3 } };
    reply = preferChinese ? '我来做一次存储扫描。' : 'Running a storage scan.';
  } else if (canEcho) {
    toolCall = { actionId: 'demo.echo.v1', arguments: { text: userText } };
    reply = preferChinese ? '我来复述一遍你的输入（用于演示）。' : 'Echoing your input (demo).';
  } else {
    reply = preferChinese
      ? '没有匹配到可执行动作，请检查客户端 capability 列表。'
      : 'No matching action. Check the client capability list.';
  }

  const raw = JSON.stringify({ reply, toolPlan, toolCall }, null, 0);
  return { raw, content: raw, usage: null };
}

async function callChatProvider(params: {
  messages: ChatMessage[];
  temperature: number;
  locale: string;
  allowedActionIds: Set<string>;
}) {
  const mockMode = (process.env.A2ACTION_MOCK_MODE ?? '').trim().toLowerCase();
  if (mockMode === 'router' || mockMode === 'local') {
    return buildLocalPlannerOutput(params.messages, params.allowedActionIds, params.locale);
  }
  if (mockMode === '1' || mockMode === 'true') {
    return {
      content: '(mock) Ready.',
      usage: null,
      raw: JSON.stringify({ reply: '(mock) Ready.', toolPlan: [], toolCall: null }),
    };
  }

  let apiKey = '';
  try {
    apiKey = (apiKeySecret.value() || '').trim();
  } catch (_) {
    apiKey = '';
  }
  if (!apiKey) {
    apiKey = (process.env.A2ACTION_API_KEY ?? '').trim();
  }

  if (!RESOLVED_BASE_URL) {
    throw new HttpsError('failed-precondition', 'A2ACTION_CHAT_BASE_URL is not configured.');
  }

  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'A2ACTION_API_KEY is not configured.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  const endpoint = `${RESOLVED_BASE_URL}/chat/completions`;
  const payload = { model: RESOLVED_MODEL, messages: params.messages, temperature: params.temperature };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new HttpsError('internal', `Provider error ${res.status}`, body.slice(0, 1000));
    }

    const json = (await res.json()) as any;
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new HttpsError('internal', 'Provider response missing choices[0].message.content');
    }

    return {
      content,
      usage: json?.usage ?? null,
      raw: content,
    };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new HttpsError('deadline-exceeded', 'Chat provider timeout');
    }
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', error?.message ?? String(error));
  } finally {
    clearTimeout(timer);
  }
}

export const a2actionOrchestrator = onCall(
  {
    region: 'us-central1',
    secrets: [apiKeySecret],
  },
  async (request) => {
    const payload = request.data as ChatRequestPayload;
    const locale = normalizeLocale(payload.locale);
    const temperature = safeTemperature(payload.temperature);

    const promptText = typeof payload.prompt === 'string' ? clampText(payload.prompt) : '';
    const history = coerceHistory(payload.messages).filter((m) => m.role !== 'system');
    if (promptText && (history.length === 0 || history[history.length - 1].role !== 'user')) {
      history.push({ role: 'user', content: promptText });
    }
    if (!promptText && history.length === 0) {
      throw new HttpsError('invalid-argument', 'A prompt or message history is required.');
    }

    const context = sanitizeContext(payload.context);
    const selectionSeed = promptText || latestUserText(history);
    context.selectionSeed = selectionSeed;

    let dynamicToolPrompt: string | undefined;
    if (context.clientCapabilityIds.length) {
      if (context.ragMode === 'rag.v2') {
        try {
          const scored = await selectTools(selectionSeed, context);
          if (scored.length) {
            dynamicToolPrompt = buildDynamicSystemPrompt(scored, locale, context, 6);
          }
          logger.info('Tool selection', { top: scored.slice(0, 5).map((t) => `${t.id}:${t.score.toFixed(2)}`) });
        } catch (error) {
          logger.warn('Tool selection failed', { error: error instanceof Error ? error.message : String(error) });
        }
      } else {
        const allowed = context.clientCapabilityIds.filter((id) => registry[id] != null);
        const scored: ScoredTool[] = allowed.map((id) => ({ id, score: 0, def: registry[id] }));
        if (scored.length) {
          dynamicToolPrompt = buildDynamicSystemPrompt(scored, locale, context, scored.length);
        }
      }
    }

    const systemPrompt = buildBaseSystemPrompt(locale, dynamicToolPrompt);
    const conversation: ChatMessage[] = [{ role: 'system', content: systemPrompt }, ...history];

    logger.info('a2actionOrchestrator request', {
      locale,
      temperature,
      ragMode: context.ragMode,
      capabilities: context.clientCapabilityIds.length,
      lastActiveToolId: context.lastActiveToolId ?? null,
    });

    const provider = await callChatProvider({
      messages: conversation,
      temperature,
      locale,
      allowedActionIds: context.allowedActionIds,
    });
    const interpreted = interpretModelMessage(provider.raw);
    const filtered = filterToAllowed(context.allowedActionIds, interpreted);

    return {
      locale,
      content: interpreted.text,
      usage: provider.usage,
      toolCall: filtered.toolCall,
      toolPlan: filtered.toolPlan,
    };
  },
);
