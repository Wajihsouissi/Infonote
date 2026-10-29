import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
const result = await build({ configFile: false, logLevel: 'silent', ssr: { noExternal: true }, build: { target: 'esnext', ssr: fileURLToPath(new URL('./structural-blocks.spec.ts', import.meta.url)), write: false, minify: false } });
const chunk = (Array.isArray(result) ? result[0] : result).output.find(e => e.type === 'chunk');
const bundle = new URL('../node_modules/.cache/qa/structural-blocks.spec.mjs', import.meta.url);
await mkdir(new URL('./', bundle), { recursive: true });
await writeFile(bundle, chunk.code);
await import(bundle.href);
