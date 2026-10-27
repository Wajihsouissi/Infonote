import { runEditorDomChecks } from './editor-dom-checks';
import { runDocumentChecks } from './editor-document-checks';
import { Profiler, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles/design-system.css';
import { BlockEditor } from '../src/features/editor/ui/surface/BlockEditor';
import { buildRenderTree, isHiddenByCollapsedToggle } from '../src/features/editor/document/blockTree';
import type { Block } from '../src/features/editor/types';

const query = new URLSearchParams(location.search);
const count = Math.max(1, Math.min(3000, Number(query.get('blocks') || 100)));
const mode = query.get('mode') || 'text';
const metrics = { count, mode, mountReactMs: 0, updateReactMs: [] as number[], inputToFrameMs: [] as number[], inputToSecondFrameMs: [] as number[], eventDurations: [] as number[], inputProcessingMs: [] as number[], keyProcessingMs: [] as number[], longTasks: [] as number[], commits: 0, updates: 0, ownerMs: [] as number[], savedFirst: '', savedLast: '', savedHasSecond: true, savedBlocks: [] as Block[], innerTextReads: 0, innerTextMs: 0 };
if(query.get('profileDOM')==='1') {
  const original=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'innerText')!;
  Object.defineProperty(HTMLElement.prototype,'innerText',{...original,get(){const start=performance.now();const value=original.get!.call(this);metrics.innerTextReads++;metrics.innerTextMs+=performance.now()-start;return value;}});
}
const summary = (values: number[]) => {
  const sorted = [...values].sort((a,b) => a-b);
  return { n: values.length, mean: values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0, p95: sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)] || 0, max: sorted.at(-1) || 0 };
};
const text = 'A paragraph about research, connected ideas, and the next useful step. ';
function makeBlocks(): Block[] {
  if (mode === 'formatted') return [{id:'b-0',type:'text',content:'Before **boldword** after'}];
  if (mode === 'long-paragraph') return [{ id: 'b-0', type:'text', content: text.repeat(count) }];
  if (mode === 'columns') return [{ id:'columns', type:'columns',content:'', metadata:{columns:[0,1].map(c=>({id:'col-'+c,content:Array.from({length:count},(_,i)=>({id:`c${c}-${i}`,type:'text' as const, content:`Paragraph ${i}. ${text}`}))}))}}];
  if (mode === 'table') return [{ id:'table',type:'table',content:'',metadata:{rows:Array.from({length:count},(_,r)=>Array.from({length:5},(_,c)=>`Cell ${r}:${c}`))}}];
  return Array.from({length:count},(_,i)=>({id:`b-${i}`,type: i%10===0?'heading2':'text',content:`Paragraph ${i}. ${text}`}));
}
const collapseExample: Block[] = [
  {id:'closed',type:'toggle',content:'Closed',indent:0,metadata:{isCollapsed:true}},
  {id:'hidden',type:'text',content:'Hidden',indent:1},
  {id:'open',type:'toggle',content:'Open',indent:0,metadata:{isCollapsed:false}},
  {id:'visible',type:'text',content:'Visible child',indent:1},
];
const structural = { visibleChildRendered: buildRenderTree(collapseExample)[1].children[0].block.id === 'visible', visibleChildReportedHidden: isHiddenByCollapsedToggle(collapseExample,3) };
new PerformanceObserver(list=>{for(const e of list.getEntries()) metrics.longTasks.push(e.duration);}).observe({type:'longtask'});
new PerformanceObserver(list=>{for(const e of list.getEntries()) { if(['keydown','keypress','input'].includes(e.name)) metrics.eventDurations.push(e.duration); }}).observe({type:'event',durationThreshold:16});
export function Audit() {
  const initial = useMemo(() => makeBlocks(),[]);
  const [content,setContent] = useState(initial);
  const [domChecks, setDomChecks] = useState('Not run');
  const [documentChecks, setDocumentChecks] = useState('Not run');
  const [race,setRace] = useState(false);
  const [structuralRace,setStructuralRace] = useState(false);
  useEffect(()=>{
    const node = document.getElementById('metrics')!;
    const publish = ()=>{
      node.textContent=JSON.stringify({blocks:count,mode,domElements:document.querySelectorAll('#editor *').length,editables:document.querySelectorAll('#editor [contenteditable="true"]').length,mountReactMs:metrics.mountReactMs,updateReactMs:summary(metrics.updateReactMs),inputToFrameMs:summary(metrics.inputToFrameMs),inputToSecondFrameMs:summary(metrics.inputToSecondFrameMs),eventDurations:summary(metrics.eventDurations),inputProcessingMs:summary(metrics.inputProcessingMs),keyProcessingMs:summary(metrics.keyProcessingMs),longTasks:summary(metrics.longTasks),commits:metrics.commits,ownerUpdates:metrics.updates,ownerMs:summary(metrics.ownerMs),savedFirst:metrics.savedFirst,savedLast:metrics.savedLast,savedHasSecond:metrics.savedHasSecond,savedBlocks:metrics.savedBlocks,innerTextReads:metrics.innerTextReads,innerTextMs:metrics.innerTextMs,structural},null,2);
    };
    // Consumers may read metrics before the first interval after a fast edit.
    publish();
    const timer = setInterval(publish,200);
    return ()=>clearInterval(timer);
  },[]);
  return <main style={{padding:24,display:'grid',gridTemplateColumns:'minmax(0,1fr) 340px',gap:24,color:'var(--text-main)',background:'var(--bg-workspace)',height:'100vh'}}>
    <section><h1>Editor performance fixture</h1><p>{count} units · {mode} · in-memory fixture</p>
      <label><input type="checkbox" checked={race} onChange={e=>setRace(e.target.checked)}/>Delete second block during next edit</label><br/>
      <label><input type="checkbox" checked={structuralRace} onChange={e=>setStructuralRace(e.target.checked)}/>Change second block during next edit</label>
      <div id="editor" style={{height:480,overflow:'auto',background:'var(--node-bg)',padding:16}}
        onKeyDownCapture={()=>{const started=performance.now();queueMicrotask(()=>metrics.keyProcessingMs.push(performance.now()-started));}}
        onInputCapture={()=>{const started=performance.now();queueMicrotask(()=>metrics.inputProcessingMs.push(performance.now()-started));requestAnimationFrame(()=>{metrics.inputToFrameMs.push(performance.now()-started);requestAnimationFrame(()=>metrics.inputToSecondFrameMs.push(performance.now()-started));});
          if(race){setRace(false);setTimeout(()=>setContent(current=>current.filter(b=>b.id!=='b-1')),20);}
          if(structuralRace){setStructuralRace(false);setTimeout(()=>setContent(current=>current.map(b=>b.id==='b-1'?{...b,content:'Incoming external second-block edit'}:b)),20);}
        }}>
        <Profiler id="editor" onRender={(_,phase,duration)=>{metrics.commits++;if(phase==='mount')metrics.mountReactMs+=duration;else metrics.updateReactMs.push(duration);}}>
          <BlockEditor initialContent={content} onUpdate={next=>{const start=performance.now();metrics.updates++;metrics.savedBlocks=next.slice(0,5).map(({ id, type, content }) => ({ id, type, content }));metrics.savedFirst=next[0]?.content.slice(-80)||'';metrics.savedLast=next.at(-1)?.content.slice(-80)||'';metrics.savedHasSecond=next.some(b=>b.id==='b-1');setContent(next);metrics.ownerMs.push(performance.now()-start);}} />
        </Profiler>
      </div>
    </section>
    <aside><button onClick={() => { try { setDomChecks(runEditorDomChecks().join('\n')); } catch(error) { setDomChecks('FAIL '+String(error)); } }}>Run DOM regression checks</button><pre id="dom-checks">{domChecks}</pre>
      <button disabled={documentChecks === 'Running'} onClick={async () => {
        setDocumentChecks('Running');
        try { setDocumentChecks((await runDocumentChecks()).join('\n')); }
        catch (error) { setDocumentChecks('FAIL ' + String(error)); }
      }}>Run saving regression checks</button><pre id="document-checks">{documentChecks}</pre>
      <button onClick={()=>{metrics.updateReactMs.length=0;metrics.inputToFrameMs.length=0;metrics.inputToSecondFrameMs.length=0;metrics.eventDurations.length=0;metrics.inputProcessingMs.length=0;metrics.keyProcessingMs.length=0;metrics.longTasks.length=0;metrics.updates=0;metrics.commits=0;}}>Reset typing metrics</button><pre id="metrics" style={{fontSize:12,whiteSpace:'pre-wrap'}}/></aside>
  </main>;
}
document.documentElement.setAttribute('data-theme','dark');
const root = createRoot(document.getElementById('root')!);
root.render(<Audit/>);
import.meta.hot?.dispose(() => root.unmount());
