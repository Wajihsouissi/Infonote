import assert from 'node:assert/strict';
import { loadLocalWorkspace, readLocalWorkspaceSummary, saveLocalWorkspace, LocalWorkspaceConflictError } from '../src/services/storage/workspace/LocalWorkspaceStore';
import type { AppNode } from '../src/types';

type Row = Record<string, unknown>;
type Stores = Map<string, Map<string, Row>>;
const headerStore='workspaces',nodeStore='workspace-nodes',edgeStore='workspace-edges';
/** Strict transaction port: only the initial task and request callbacks may
 * enqueue IDB work. Promise continuations run after that active phase ends,
 * reproducing the Firefox failure seen during the headed popup test. */
class StrictTransaction {
    active=true; aborted=false; pending=0; error: Error|null=null;
    oncomplete:(()=>void)|null=null; onabort:(()=>void)|null=null; onerror:(()=>void)|null=null;
    rows:Stores;
    constructor(private db:StrictDatabase,private mode:string) { this.rows=structuredClone(db.rows); }
    assertActive() { if(!this.active||this.aborted) throw new Error('Transaction is already committing or done.'); }
    enqueue<T>(operation:()=>T) {
        this.assertActive();this.pending++;
        const request:{result?:T;transaction:StrictTransaction;onsuccess:(()=>void)|null;onerror:(()=>void)|null;error?:Error}={transaction:this,onsuccess:null,onerror:null};
        setTimeout(()=>{
            if(this.aborted)return;
            this.active=true;
            try {request.result=operation();request.onsuccess?.();}
            catch(error) {request.error=error as Error;request.onerror?.();this.abort();}
            this.active=false;this.pending--;
            if(!this.pending&&!this.aborted) setTimeout(()=>{
                if(this.aborted||this.pending)return;
                if(this.mode==='readwrite')this.db.rows=this.rows;
                this.db.commits++;this.oncomplete?.();
            },0);
        },0);
        return request;
    }
    objectStore(name:string) {
        this.assertActive();const rows=this.rows.get(name)!;
        const key=(value:unknown)=>JSON.stringify(value);
        return {
            get:(id:unknown)=>this.enqueue(()=>structuredClone(rows.get(key(id)))),
            put:(row:Row)=>{
                this.assertActive();const value=structuredClone(row);
                const id=name===headerStore?row.key:[row.workspace,row.id];
                this.db.writes.push({store:name,id:row.id??row.key});
                return this.enqueue(()=>{rows.set(key(id),value);return id;});
            },
            delete:(id:unknown)=>this.enqueue(()=>rows.delete(key(id))),
            index:()=>({getAll:(workspace:string)=>this.enqueue(()=>[...rows.values()].filter(row=>row.workspace===workspace).map(row=>structuredClone(row)))}),
        };
    }
    abort() {if(this.aborted)return;this.aborted=true;this.active=false;this.error=new Error('Transaction aborted.');setTimeout(()=>this.onabort?.(),0);}
}
class StrictDatabase {
    rows:Stores=new Map([headerStore,nodeStore,edgeStore].map(name=>[name,new Map()]));
    writes:{store:string;id:unknown}[]=[];commits=0;closes=0;
    transaction(_stores:string[],mode:string) {return new StrictTransaction(this,mode);}
    close(){this.closes++;}
    values(name:string){return [...this.rows.get(name)!.values()];}
}
let passed=0,failed=0;
let workspaceKey='';let fixtureSequence=0;
async function check(name:string,run:(db:StrictDatabase)=>Promise<void>) {
    workspaceKey=`transaction-fixture-${++fixtureSequence}`;
    const db=new StrictDatabase();(globalThis as unknown as {__strictLocalDb:StrictDatabase}).__strictLocalDb=db;
    try {await run(db);passed++;console.log(`PASS ${name}`);}
    catch(error){failed++;console.error(`FAIL ${name}: ${error instanceof Error?error.message:error}`);}
}
const node=(id:string,text=id):AppNode=>({id,type:'note',position:{x:0,y:0},data:{label:id,content:[{id:`body-${id}`,type:'text',content:text}]}} as AppNode);
const save=(nodes:AppNode[],edges:{id:string;source:string;target:string}[]=[])=>saveLocalWorkspace({key:workspaceKey,nodes,edges,updatedAt:1234});
const firstContent=(value:AppNode|undefined)=>Array.isArray(value?.data.content)?value.data.content[0]?.content:value?.data.content;
await check('save queues dependent writes while active and resolves only after commit',async db=>{
    await save([node('a')]);assert.equal(db.commits,1);assert.equal(db.closes,1);
    assert.equal(db.values(headerStore)[0].format,3);assert.equal(db.values(nodeStore)[0].id,'a');
});
await check('load queues all reads before yielding and retains saved entity order',async()=>{
    await save([node('b'),node('a')],[{id:'e',source:'b',target:'a'}]);
    const loaded=await loadLocalWorkspace(workspaceKey);assert.deepEqual(loaded?.nodes.map(node=>node.id),['b','a']);assert.deepEqual(loaded?.edges.map(edge=>edge.id),['e']);
});
await check('incremental save rewrites only the changed node and the header',async db=>{
    const a=node('a'),b=node('b');await save([a,b]);db.writes=[];
    await save([node('a','changed'),b]);
    assert.deepEqual(db.writes,[{store:nodeStore,id:'a'},{store:headerStore,id:workspaceKey}]);
    assert.equal(firstContent((await loadLocalWorkspace(workspaceKey))?.nodes[0]),'changed');
});
await check('removing entities deletes stale rows and updates header identifiers',async db=>{
    const b=node('b');await save([node('a'),b],[{id:'e',source:'a',target:'b'}]);await save([b]);
    assert.deepEqual(db.values(nodeStore).map(row=>row.id),['b']);assert.deepEqual(db.values(edgeStore),[]);
    assert.deepEqual(db.values(headerStore)[0].nodeIds,['b']);assert.deepEqual(db.values(headerStore)[0].edgeIds,[]);
});
await check('a cloning failure rolls back prior queued writes and releases the operation queue',async db=>{
    await save([node('a','original')]);const original=structuredClone(db.rows);
    const bad=node('bad');bad.data.uncloneable=()=>{};
    await assert.rejects(save([node('a','must rollback'),bad]));assert.deepEqual(db.rows,original);
    await save([node('a','recovered')]);assert.equal(firstContent((await loadLocalWorkspace(workspaceKey))?.nodes[0]),'recovered');
});
await check('summary distinguishes an empty database from a committed workspace',async()=>{
    assert.equal(await readLocalWorkspaceSummary(workspaceKey),null);await save([node('a')]);
    assert.deepEqual(await readLocalWorkspaceSummary(workspaceKey),{nodes:1,edges:0,updatedAt:1234});
});
await check('unchanged semantic graph does not rewrite the header or any entity',async db=>{
    const a=node('a');await save([a]);const before=structuredClone(db.rows);db.writes=[];
    await saveLocalWorkspace({key:workspaceKey,nodes:[{...a,selected:true,dragging:true,measured:{width:500,height:400}}],edges:[],updatedAt:9999});
    assert.deepEqual(db.writes,[]);assert.deepEqual(db.rows,before);
});
await check('another durable commit refuses the stale edit before any write',async db=>{
    await save([node('a')]);db.values(headerStore)[0].commit='remote-commit';const before=structuredClone(db.rows);db.writes=[];
    await assert.rejects(save([node('a','stale')]),LocalWorkspaceConflictError);assert.deepEqual(db.writes,[]);assert.deepEqual(db.rows,before);
});
await check('a stale deletion cannot remove another writer’s newer entities',async db=>{
    await save([node('a'),node('b')]);db.values(headerStore)[0].commit='remote-delete-fence';const before=structuredClone(db.rows);
    await assert.rejects(save([]),LocalWorkspaceConflictError);assert.deepEqual(db.rows,before);
});
await check('a missing formerly committed header refuses resurrection',async db=>{
    await save([node('a')]);db.rows.get(headerStore)!.clear();const before=structuredClone(db.rows);
    await assert.rejects(save([node('a')]),LocalWorkspaceConflictError);assert.deepEqual(db.rows,before);
});
await check('an unread existing workspace cannot be overwritten by a fresh writer',async db=>{
    const key=`unread-${workspaceKey}`;db.rows.get(headerStore)!.set(JSON.stringify(key),{key,format:3,commit:'existing',nodeIds:[],edgeIds:[],updatedAt:1});
    const before=structuredClone(db.rows);await assert.rejects(saveLocalWorkspace({key,nodes:[],edges:[],updatedAt:2}),LocalWorkspaceConflictError);assert.deepEqual(db.rows,before);
});
await check('an empty load is still fenced against an independent first commit',async db=>{
    assert.equal(await loadLocalWorkspace(workspaceKey),null);
    db.rows.get(headerStore)!.set(JSON.stringify(workspaceKey),{key:workspaceKey,format:3,commit:'first-other-tab',nodeIds:[],edgeIds:[],updatedAt:1});
    const before=structuredClone(db.rows);await assert.rejects(save([node('a')]),LocalWorkspaceConflictError);assert.deepEqual(db.rows,before);
});
await check('workspace bases remain independent after accessing a different key',async db=>{
    const a=node('a'),b=node('b');await save([a,b]);await saveLocalWorkspace({key:`side-${workspaceKey}`,nodes:[node('side')],edges:[],updatedAt:1});db.writes=[];
    await save([node('a','changed'),b]);assert.deepEqual(db.writes,[{store:nodeStore,id:'a'},{store:headerStore,id:workspaceKey}]);
});
await check('a deliberate reload adopts the current revision before subsequent editing',async db=>{
    await save([node('a')]);db.values(headerStore)[0].commit='newer';
    await loadLocalWorkspace(workspaceKey);await save([node('a','after reopening')]);assert.equal(firstContent((await loadLocalWorkspace(workspaceKey))?.nodes[0]),'after reopening');
});
await check('unsupported headers refuse loading and saving without mutation',async db=>{
    await save([node('a')]);db.values(headerStore)[0].format=99;const before=structuredClone(db.rows);
    await assert.rejects(loadLocalWorkspace(workspaceKey),/unsupported format/);await assert.rejects(save([]),/unsupported format/);assert.deepEqual(db.rows,before);
});
await check('missing entity rows and duplicate header IDs refuse hydration',async db=>{
    await save([node('a')]);const header=db.values(headerStore)[0];header.nodeIds=['a','a'];
    await assert.rejects(loadLocalWorkspace(workspaceKey),/header is incomplete/);header.nodeIds=['absent'];
    await assert.rejects(loadLocalWorkspace(workspaceKey),/workspace is incomplete/);
});
await check('mismatched record identities refuse hydration',async db=>{
    await save([node('a')]);db.values(nodeStore)[0].value=node('wrong');await assert.rejects(loadLocalWorkspace(workspaceKey),/identities do not match/);
});
await check('orphan rows without a header do not masquerade as a fresh workspace',async db=>{
    await save([node('a')]);db.rows.get(headerStore)!.clear();await assert.rejects(loadLocalWorkspace(workspaceKey),/no header/);assert.equal(db.values(nodeStore).length,1);
});
await check('reordering changes only header order, retaining entity payloads',async db=>{
    const a=node('a'),b=node('b');await save([a,b]);db.writes=[];await save([b,a]);assert.deepEqual(db.writes,[{store:headerStore,id:workspaceKey}]);assert.deepEqual((await loadLocalWorkspace(workspaceKey))?.nodes.map(n=>n.id),['b','a']);
});
await check('intentional deletion of the entire graph remains a valid saved workspace',async db=>{
    await save([node('a')],[{id:'edge',source:'a',target:'a'}]);await save([]);const result=await loadLocalWorkspace(workspaceKey);
    assert(result);assert.deepEqual(result.nodes,[]);assert.deepEqual(result.edges,[]);assert.equal(db.values(nodeStore).length,0);assert.equal(db.values(edgeStore).length,0);
});
await check('duplicate input identities are refused before touching saved records',async db=>{
    await save([node('a')]);const before=structuredClone(db.rows);await assert.rejects(save([node('x'),node('x')]),/duplicate or missing/);assert.deepEqual(db.rows,before);
});
console.log(`${passed} local transaction checks passed; ${failed} failed.`);
if(failed)throw new Error(`${failed} local transaction contract(s) failed.`);
