import registryJson from '../tools/registry.json' with { type: 'json' };
import { getEmbedding } from './embeddings.js';
import { loadToolVectors } from './vector_store.js';
import type { ScoredTool, ToolRegistryItem, ToolSelectionContext } from './types.js';

const registry = registryJson as Record<string, ToolRegistryItem>;

const VECTOR_WEIGHT = 0.75;
const CONTEXT_WEIGHT = 0.15;
const HEURISTIC_WEIGHT = 0.1;

const CONTEXT_ACTIVE_SCORE = 3.0;
const HEURISTIC_IMAGE_SCORE = 3.0;
const HEURISTIC_M3U_SCORE = 10.0;

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (!Number.isFinite(denom) || denom <= 0) return 0;
  return dot / denom;
}

function normalizeText(text: string): string {
  return text.trim().toLowerCase();
}

function hasImage(attachments?: ToolSelectionContext['attachments']): boolean {
  if (!attachments?.length) return false;
  return attachments.some((att) => {
    const mime = (att.mimeType ?? '').toLowerCase();
    const name = (att.name ?? '').toLowerCase();
    const kind = (att.kind ?? '').toLowerCase();
    return (
      kind === 'image' ||
      mime.startsWith('image/') ||
      name.endsWith('.png') ||
      name.endsWith('.jpg') ||
      name.endsWith('.jpeg') ||
      name.endsWith('.webp')
    );
  });
}

function looksLikeM3u(text: string): boolean {
  const normalized = normalizeText(text);
  return normalized.includes('.m3u') || normalized.includes('.m3u8');
}

export async function selectTools(seed: string, context: ToolSelectionContext): Promise<ScoredTool[]> {
  const candidateIds = context.clientCapabilityIds.filter((id) => registry[id] != null);
  if (!candidateIds.length) return [];

  const normalizedSeed = seed.trim();
  const vectors = loadToolVectors();

  let queryVector: number[] | null = null;
  try {
    if (normalizedSeed.length) {
      queryVector = await getEmbedding(normalizedSeed);
    }
  } catch {
    queryVector = null;
  }

  const imageBoostActive = hasImage(context.attachments);
  const m3uBoostActive = looksLikeM3u(normalizedSeed);
  const lastActive = (context.lastActiveToolId ?? '').trim();

  const scored: ScoredTool[] = [];
  for (const id of candidateIds) {
    const def = registry[id];
    const toolVec = vectors[id];

    const vectorScore =
      queryVector && toolVec && toolVec.length === queryVector.length ? cosineSimilarity(queryVector, toolVec) : 0;
    const contextScore = lastActive && id === lastActive ? CONTEXT_ACTIVE_SCORE : 0;

    const signals = def.signals ?? [];
    let heuristicScore = 0;
    if (imageBoostActive && signals.includes('image')) {
      heuristicScore += HEURISTIC_IMAGE_SCORE;
    }
    if (m3uBoostActive && signals.includes('url_m3u')) {
      heuristicScore += HEURISTIC_M3U_SCORE;
    }

    const score = vectorScore * VECTOR_WEIGHT + contextScore * CONTEXT_WEIGHT + heuristicScore * HEURISTIC_WEIGHT;
    const reasonParts = [];
    if (contextScore > 0) reasonParts.push('context');
    if (heuristicScore > 0) reasonParts.push('heuristic');
    if (vectorScore > 0) reasonParts.push('vector');

    scored.push({
      id,
      score,
      def,
      reason: reasonParts.length ? reasonParts.join('+') : undefined,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}
