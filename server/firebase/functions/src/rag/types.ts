export type Role = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface CapabilitySpec {
  id: string;
  name?: string;
  summary?: string;
  requiredPermissions?: string[];
  arguments?: Record<string, unknown>;
}

export interface AttachmentDescriptor {
  name?: string;
  kind?: string;
  mimeType?: string;
}

export interface ToolRegistryItem {
  embedding_text: string;
  guidance: string;
  signals?: string[];
  guidance_ios?: string;
  guidance_android?: string;
}

export interface ToolSelectionContext {
  platform?: string;
  attachments?: AttachmentDescriptor[];
  lastActiveToolId?: string;
  clientCapabilityIds: string[];
  selectionSeed?: string;
}

export interface ScoredTool {
  id: string;
  score: number;
  def: ToolRegistryItem;
  reason?: string;
}

export interface ToolCall {
  actionId: string;
  arguments: Record<string, any>;
}

export interface ToolPlanStep {
  actionId: string;
  arguments: Record<string, any>;
}
