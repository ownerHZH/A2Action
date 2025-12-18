import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const functionsDir = path.join(scriptsDir, '..');
const srcToolsDir = path.join(functionsDir, 'src', 'tools');
const outToolsDir = path.join(functionsDir, 'lib', 'tools');

await fs.mkdir(outToolsDir, { recursive: true });

const entries = await fs.readdir(srcToolsDir, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isFile()) continue;
  if (!entry.name.endsWith('.json')) continue;
  await fs.copyFile(path.join(srcToolsDir, entry.name), path.join(outToolsDir, entry.name));
}

console.log(`Copied tool assets to ${outToolsDir}`);
