/**
 * Run a `scripts/check-*.mts` file that reaches into app code.
 *
 * The plain `node --experimental-strip-types` runner only works for checks
 * whose target is a leaf module: app files import each other without file
 * extensions and some of them read `import.meta.env`, neither of which Node's
 * ESM resolver accepts. Bundling with the esbuild that Vite already ships
 * resolves both, and keeps the checks browser-free and fast.
 *
 * Usage: node scripts/run-bundled-check.mjs scripts/check-ai-part-rewrite.mts
 */
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const entry = process.argv[2];
if (!entry) {
    console.error('Usage: node scripts/run-bundled-check.mjs <scripts/check-something.mts>');
    process.exit(2);
}

const outfile = resolve('node_modules/.cache', `${basename(entry).replace(/\.mts$/, '')}.mjs`);

await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    // Real dependencies stay external; only app source is bundled.
    packages: 'external',
    define: {
        'import.meta.env': JSON.stringify({ DEV: false, PROD: true, MODE: 'test' }),
    },
    logLevel: 'warning',
});

await import(pathToFileURL(outfile).href);
