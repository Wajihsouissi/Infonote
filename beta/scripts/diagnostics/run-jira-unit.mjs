import { build } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { betaRoot, diagnosticOutput } from '../../e2e/config/diagnosticPaths.ts';

const result = await build({
    root: betaRoot,
    configFile: false,
    logLevel: 'silent',
    ssr: { noExternal: true },
    build: {
        target: 'esnext',
        ssr: fileURLToPath(new URL('./jira-unit.spec.ts', import.meta.url)),
        write: false,
        minify: false,
    },
});
const chunk = (Array.isArray(result) ? result[0] : result).output.find(entry => entry.type === 'chunk');
const { results } = await import('data:text/javascript;base64,' + Buffer.from(chunk.code).toString('base64'));
const output = diagnosticOutput('jira', 'supplemental-unit.json');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({
    results,
    passed: results.filter(result => result.status === 'passed').length,
    failed: results.filter(result => result.status === 'failed').length,
    note: 'Targeted function contracts; these results alone do not validate full UI acceptance.',
}, null, 2));
for (const result of results) {
    console.log(result.status.toUpperCase() + ' ' + result.id + ' ' + result.name + (result.error ? ' ' + result.error : ''));
}
if (results.some(result => result.status === 'failed')) process.exitCode = 1;
