import { build } from 'vite';
import { fileURLToPath } from 'node:url';
const result = await build({ configFile: false, logLevel: 'silent', ssr: { noExternal: true }, build: {
    ssr: fileURLToPath(new URL('./workspace-startup.spec.ts', import.meta.url)), write: false, minify: false,
} });
const chunk = (Array.isArray(result) ? result[0] : result).output.find(entry => entry.type === 'chunk');
try { await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`); }
catch (error) { console.error(error.message); process.exitCode = 1; }
