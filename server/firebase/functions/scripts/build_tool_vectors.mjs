import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const functionsDir = path.join(scriptsDir, '..');
const registryPath = path.join(functionsDir, 'src', 'tools', 'registry.json');
const outputPath = path.join(functionsDir, 'src', 'tools', 'tool_vectors.json');

const EMBEDDING_DIM = Number(process.env.A2ACTION_EMBEDDING_DIM ?? 64);
const EMBEDDINGS_PROVIDER = (process.env.A2ACTION_EMBEDDINGS_PROVIDER ?? 'toy').toLowerCase();

function fnv1a(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function normalize(vector) {
  let norm = 0;
  for (const v of vector) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vector.map((v) => v / norm);
}

function toyEmbedding(text, dim = EMBEDDING_DIM) {
  const vec = Array.from({ length: dim }, () => 0);
  const tokens = tokenize(text);
  for (const token of tokens) {
    const h = fnv1a(token);
    const index = h % dim;
    vec[index] += 1;
  }
  return normalize(vec);
}

async function dashscopeEmbedding(text) {
  const apiKey = (process.env.A2ACTION_API_KEY || process.env.DASHSCOPE_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('Missing A2ACTION_API_KEY (or DASHSCOPE_API_KEY) for DashScope embeddings');
  }
  const endpoint = (process.env.A2ACTION_EMBEDDINGS_URL || '').trim().replace(/\/+$/, '');
  if (!endpoint) {
    throw new Error('Missing A2ACTION_EMBEDDINGS_URL for embeddings provider');
  }
  const model = process.env.A2ACTION_EMBEDDINGS_MODEL || 'text-embedding-v4';

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
      parameters: { text_type: 'document' },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DashScope embeddings error ${res.status}: ${body.slice(0, 500)}`);
  }

  const json = await res.json();
  const embedding = json?.output?.embeddings?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error('DashScope embeddings response missing output.embeddings[0].embedding');
  }
  return embedding.map((v) => Number(v));
}

const registryRaw = await fs.readFile(registryPath, 'utf8');
const registry = JSON.parse(registryRaw);

const vectors = {};
for (const [toolId, def] of Object.entries(registry)) {
  const embeddingText = def?.embedding_text;
  if (typeof embeddingText !== 'string' || embeddingText.trim().length === 0) continue;
  if (EMBEDDINGS_PROVIDER === 'dashscope') {
    vectors[toolId] = await dashscopeEmbedding(embeddingText);
  } else {
    vectors[toolId] = toyEmbedding(embeddingText);
  }
}

await fs.writeFile(outputPath, JSON.stringify(vectors, null, 2) + '\n', 'utf8');
console.log(`Wrote ${Object.keys(vectors).length} tool vectors to ${outputPath}`);
