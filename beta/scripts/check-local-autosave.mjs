import { build } from 'vite';
import { fileURLToPath } from 'node:url';

// Exercise the production controller with real Zustand subscriptions and a
// controlled storage port, clock and folder port. No browser/user data involved.
const mockModules = {
    '../../../store/useStore': `export const useStore={getState:()=>globalThis.__autosaveFixture.store.getState(),subscribe:(...args)=>globalThis.__autosaveFixture.store.subscribe(...args)};`,
    '../../../store/graphHelpers': `export const flushParentSyncs=()=>{};`,
    './LocalWorkspaceStore': `export const LOCAL_WORKSPACE_KEY='anonymous';export const loadLocalWorkspace=()=>Promise.resolve(globalThis.__autosaveFixture.loaded);export const saveLocalWorkspace=record=>globalThis.__autosaveFixture.save(record);export const subscribeLocalWorkspaceChanges=listener=>{globalThis.__autosaveFixture.external=listener;return()=>{globalThis.__autosaveFixture.external=null}};`,
    './welcomeCanvas': `export const hasBeenWelcomed=()=>true;export const markWelcomed=()=>{};export const welcomeCanvas=()=>({nodes:[],edges:[]});`,
    './folderPersistence': `export const folderHasPendingChanges=()=>false;export const getFolderStatus=()=>({phase:'off'});export const markFolderDirty=()=>{};export const queueFolderSave=graph=>globalThis.__autosaveFixture.folderWrites.push(graph);export const reconnectFolder=()=>Promise.resolve(null);`,
};
const result = await build({
    configFile: false, logLevel: 'silent', ssr: { noExternal: true },
    plugins: [{
        name: 'autosave-test-ports',
        enforce: 'pre',
        resolveId(id, importer) { if (importer?.replaceAll('\\', '/').endsWith('/localPersistence.ts') && id in mockModules) return `\0autosave:${id}`; },
        load(id) { if (id.startsWith('\0autosave:')) return mockModules[id.slice('\0autosave:'.length)]; },
    }],
    build: { target: 'esnext', ssr: fileURLToPath(new URL('./local-autosave.spec.mjs', import.meta.url)), write: false, minify: false },
});
const chunk = (Array.isArray(result) ? result[0] : result).output.find(e => e.type === 'chunk');
try { await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`); }
catch (error) { console.error(error.message); process.exitCode = 1; }
