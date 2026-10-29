import { build } from 'vite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const result = await build({ configFile: false, logLevel: 'silent', ssr: { noExternal: true },
    plugins: [{name:'strict-transaction-port',enforce:'pre',
        resolveId(id,importer) { if(id==='../openDatabase'&&importer?.replaceAll('\\','/').endsWith('/LocalWorkspaceStore.ts')) return '\0strict-local-db'; },
        async load(id) {
            if(id==='\0strict-local-db') return 'export const openDatabase=async()=>globalThis.__strictLocalDb;';
            if(process.env.SCRUM28_STORAGE_BASELINE==='1'&&id.replaceAll('\\','/').endsWith('/src/services/storage/workspace/LocalWorkspaceStore.ts'))
                return readFile(new URL('../qa/scrum-28/baseline-source/src/services/storage/workspace/LocalWorkspaceStore.ts',import.meta.url),'utf8');
        },
    }],
    build:{target:'esnext',ssr:fileURLToPath(new URL('./local-transactions.spec.ts',import.meta.url)),write:false,minify:false},
});
const chunk=(Array.isArray(result)?result[0]:result).output.find(entry=>entry.type==='chunk');
try { await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`); }
catch(error) { console.error(error.message);process.exitCode=1; }
