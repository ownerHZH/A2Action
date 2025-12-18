import { defineSecret } from 'firebase-functions/params';
import { toyEmbedding } from './toy_embedding.js';

const apiKeySecret = defineSecret('A2ACTION_API_KEY');

const DEFAULT_DASHSCOPE_EMBEDDINGS_MODEL = 'text-embedding-v4';
const DEFAULT_DIM = 64;

type EmbeddingsProvider = 'toy' | 'dashscope';

export async function getEmbedding(text: string, apiKeyOverride?: string): Promise<number[]> {
  const provider = ((process.env.A2ACTION_EMBEDDINGS_PROVIDER ?? 'toy').trim().toLowerCase() ||
    'toy') as EmbeddingsProvider;

  if (provider === 'dashscope') {
    const apiKey =
      (apiKeyOverride ?? '').trim() ||
      (() => {
        try {
          return (apiKeySecret.value() ?? '').trim();
        } catch (_) {
          return '';
        }
      })() ||
      (process.env.A2ACTION_API_KEY ?? '').trim() ||
      (process.env.DASHSCOPE_API_KEY ?? '').trim();

    if (!apiKey) {
      throw new Error('Missing A2ACTION_API_KEY for embeddings');
    }

    const endpoint = (process.env.A2ACTION_EMBEDDINGS_URL ?? '').trim().replace(/\/+$/, '');
    if (!endpoint) {
      throw new Error('A2ACTION_EMBEDDINGS_URL is not configured');
    }
    const model = (process.env.A2ACTION_EMBEDDINGS_MODEL ?? DEFAULT_DASHSCOPE_EMBEDDINGS_MODEL).trim();

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model,
        input: { texts: [text] },
        parameters: { text_type: 'query' },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Embeddings error ${res.status}: ${body.slice(0, 400)}`);
    }

    const json = (await res.json()) as any;
    const embedding = json?.output?.embeddings?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      throw new Error('Embeddings response missing output.embeddings[0].embedding');
    }
    return embedding.map((v: any) => Number(v));
  }

  const dimRaw = Number(process.env.A2ACTION_EMBEDDING_DIM ?? DEFAULT_DIM);
  const dim = Number.isFinite(dimRaw) && dimRaw > 0 ? Math.floor(dimRaw) : DEFAULT_DIM;
  return toyEmbedding(text, dim);
}
