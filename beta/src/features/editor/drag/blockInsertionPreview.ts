import {insertionTarget,type InsertionTarget} from './insertionTarget';

type Unit={id:string;element:HTMLElement;top:number;bottom:number;translate:string;transition:string};
type Preview={root:HTMLElement;ids:string;units:Unit[];line:HTMLElement;target:InsertionTarget|null;scale:number;scroll:HTMLElement|null;scrollTop:number;gap:number;timer:ReturnType<typeof setTimeout>|null;index:number;frame:number|null;y:number;blockIds:string[];height:number};
let preview:Preview|null=null;
const scrollArea=(element:Element)=>element.closest<HTMLElement>('.infonote-scrollable,[data-scrollable="true"]');

export function clearBlockInsertionPreview(){
    const state=preview;if(!state)return;preview=null;
    if(state.timer)clearTimeout(state.timer);
    if(state.frame!==null)cancelAnimationFrame(state.frame);
    for(const unit of state.units){unit.element.style.translate=unit.translate;unit.element.style.transition=unit.transition;}
    state.line.remove();state.root.removeAttribute('data-block-insertion-preview');
    document.removeEventListener('drop',onDrop,true);window.removeEventListener('dragend',clearBlockInsertionPreview,true);
    window.removeEventListener('pointerup',onDrop,true);window.removeEventListener('keydown',onKey,true);
}
function onKey(event:KeyboardEvent){if(event.key==='Escape')clearBlockInsertionPreview();}
// Drop handlers consume the exact shown slot before presentation is restored.
function onDrop(){setTimeout(clearBlockInsertionPreview,0);}
export function currentBlockInsertionTarget(root:Element){
    return preview && (root===preview.root||root.contains(preview.root)||preview.root.contains(root)) ? preview.target : null;
}
export function currentBlockInsertionRoot(){return preview?.root??null;}
/** A late leave/unmount from the source must not erase another editor's slot. */
export function clearOwnedBlockInsertionPreview(root:Element|null){
    if(root&&preview?.root===root)clearBlockInsertionPreview();
}

function scrollAtEdge(state:Preview){
    if(state.frame!==null||!state.scroll)return;
    const box=state.scroll.getBoundingClientRect();
    if(state.y<box.top-8||state.y>box.bottom+8)return;
    const velocity=state.y<box.top+28?-8:state.y>box.bottom-28?8:0;
    if(!velocity)return;
    state.frame=requestAnimationFrame(()=>{
        state.frame=null;if(preview!==state||!state.scroll)return;
        const previous=state.scroll.scrollTop;state.scroll.scrollTop+=velocity/state.scale;
        if(state.scroll.scrollTop!==previous)previewBlockInsertion(state.root,state.blockIds,state.y,state.height);
    });
}

/** Shared insertion feedback for native editor drags and React Flow node drags,
 * including passive readers. It never mounts an editor or modifies documents. */
export function previewBlockInsertion(root:HTMLElement,ids:string[],clientY:number,height=40){
    const key=`${JSON.stringify(ids)}:${root.querySelectorAll('[data-block-id]').length}`;
    if(preview?.root!==root||preview.ids!==key){
        clearBlockInsertionPreview();
        const box=root.getBoundingClientRect(),scale=box.width/(root.offsetWidth||box.width||1);
        const units:Unit[]=[];
        for(const id of ids){
            const frame=root.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`);
            if(!frame||!frame.getClientRects().length)continue;
            const parent=frame.parentElement;
            const element=parent?.dataset.reorderGroupId===id?parent:frame;
            const rect=element.getBoundingClientRect();
            if(!rect.height)continue;
            units.push({id,element,top:rect.top-box.top,bottom:rect.bottom-box.top,translate:element.style.translate,transition:element.style.transition});
        }
        const line=document.createElement('span');line.setAttribute('data-block-insertion-line','');line.setAttribute('aria-hidden','true');
        Object.assign(line.style,{position:'absolute',height:'2px',borderRadius:'1px',background:'var(--accent)',pointerEvents:'none',zIndex:'101',display:'block'});
        root.appendChild(line);root.setAttribute('data-block-insertion-preview','');
        const scroll=units[0]?scrollArea(units[0].element):root.querySelector<HTMLElement>('.infonote-scrollable,[data-scrollable="true"]');
        preview={root,ids:key,units,line,target:null,scale,scroll,scrollTop:scroll?.scrollTop??0,gap:Math.min(80,Math.max(24,height))/scale,timer:null,index:-1,frame:null,y:clientY,blockIds:ids,height};
        document.addEventListener('drop',onDrop,true);window.addEventListener('dragend',clearBlockInsertionPreview,true);
        window.addEventListener('pointerup',onDrop,true);window.addEventListener('keydown',onKey,true);
    }
    const state=preview!,box=root.getBoundingClientRect();
    state.y=clientY;
    const delta=((state.scroll?.scrollTop??0)-state.scrollTop)*state.scale;
    const target=insertionTarget(state.units,clientY-box.top+delta);
    state.target=target;
    const first=state.units[0]?.element.getBoundingClientRect();
    const padding=first?(first.left-box.left)/state.scale:20;
    state.line.style.left=`${padding}px`;state.line.style.width=`${Math.max(30,(first?.width??box.width-40)/state.scale)}px`;
    const emptyTop=root.querySelector<HTMLElement>('[data-canvas-node-interaction]')?.getBoundingClientRect().top??box.top+48*state.scale;
    state.line.style.top=`${((target?.boundary??emptyTop-box.top)-delta)/state.scale+state.gap/2}px`;
    const index=target?.index??0;
    if(state.index!==index){
        state.index=index;if(state.timer)clearTimeout(state.timer);
        const apply=()=>{state.timer=null;if(preview!==state)return;for(let i=0;i<state.units.length;i++){
            const unit=state.units[i];unit.element.style.transition=window.matchMedia('(prefers-reduced-motion: reduce)').matches?'none':'translate 180ms var(--ease-rise, ease-out)';
            unit.element.style.translate=`0 ${i>=index?state.gap:0}px`;
        }};
        if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)apply();else state.timer=setTimeout(apply,100);
    }
    scrollAtEdge(state);
    return target;
}
