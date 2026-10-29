import { build } from 'vite';
import { fileURLToPath } from 'node:url';

// Kept outside app dist: QA fixtures are never part of a normal deployment.
await build({
    mode: 'qa',
    logLevel: 'error',
    build: {
        outDir: 'node_modules/.cache/editor-benchmark',
        emptyOutDir: false,
        rollupOptions: { input: fileURLToPath(new URL('../qa/editor-benchmark.html', import.meta.url)) },
    },
});
console.log('Production editor fixture built. Serve with npm run preview:editor-benchmark.');
