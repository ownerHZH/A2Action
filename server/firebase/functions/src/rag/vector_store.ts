import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type VectorMap = Record<string, number[]>;

let loadedVectors: VectorMap | null = null;

export function loadToolVectors(): VectorMap {
  if (loadedVectors) return loadedVectors;

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(moduleDir, '../tools/tool_vectors.json'),
    path.join(moduleDir, '../../src/tools/tool_vectors.json'),
    path.join(process.cwd(), 'lib/tools/tool_vectors.json'),
    path.join(process.cwd(), 'src/tools/tool_vectors.json'),
  ];
  const vectorPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!vectorPath) {
    loadedVectors = {};
    return loadedVectors;
  }

  try {
    const raw = fs.readFileSync(vectorPath, 'utf8');
    loadedVectors = JSON.parse(raw);
    return loadedVectors!;
  } catch {
    loadedVectors = {};
    return loadedVectors;
  }
}
