const DEFAULT_DIM = 64;

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function normalize(vector: number[]): number[] {
  let norm = 0;
  for (const v of vector) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vector.map((v) => v / norm);
}

export function toyEmbedding(text: string, dim: number = DEFAULT_DIM): number[] {
  const vec = Array.from({ length: dim }, () => 0);
  const tokens = tokenize(text);
  for (const token of tokens) {
    const h = fnv1a(token);
    const index = h % dim;
    vec[index] += 1;
  }
  return normalize(vec);
}
