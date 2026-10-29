import { build } from 'vite';
import { fileURLToPath } from 'node:url';
const result = await build({ configFile: false, logLevel: 'silent', build: {
    ssr: fileURLToPath(new URL('./reading-work.spec.ts', import.meta.url)), write: false, minify: false,
} });
const chunk = (Array.isArray(result) ? result[0] : result).output.find(entry => entry.type === 'chunk');
await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);
