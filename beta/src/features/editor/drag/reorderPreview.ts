import type { BlockDropPosition } from '../types';

type Unit = { id: string; frame: HTMLElement; element: HTMLElement; top: number; height: number; headerTop:number; headerHeight:number; scale: number };
type Preview = { editor: HTMLElement; units: Unit[]; moving: Set<string>; target: {blockId:string;position:BlockDropPosition} | null; slot: string; pending: ReturnType<typeof setTimeout> | null;
    gap: { before?: Unit; after?: Unit; height: number } | null; line: HTMLElement | null; animationFrame: number | null; committing: boolean };
let preview: Preview | null = null;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function resetTransforms() {
    if (preview?.pending) clearTimeout(preview.pending);
    if (preview) { preview.pending = null; preview.slot = ''; }
    clearPreviewLine();
    for (const unit of preview?.units ?? []) {
        unit.element.style.removeProperty('--block-reorder-y');
    }
}
function clearPreviewLine() {
    if (!preview) return;
    if (preview.animationFrame !== null) cancelAnimationFrame(preview.animationFrame);
    preview.animationFrame = null;
    preview.line?.remove(); preview.line = null; preview.gap = null;
    preview.editor.removeAttribute('data-reorder-line');
}
function gapBounds(state: Preview) {
    if (!state.gap) return null;
    const before = state.gap.before?.element.getBoundingClientRect();
    const after = state.gap.after?.element.getBoundingClientRect();
    return {top:before?.bottom ?? (after!.top-state.gap.height),bottom:after?.top ?? (before!.bottom+state.gap.height)};
}
function positionPreviewLine(state: Preview) {
    const gap = gapBounds(state);
    if (!gap || !state.line) return;
    const editor = state.editor.getBoundingClientRect();
    const scale = editor.height / (state.editor.offsetHeight || editor.height || 1);
    const content = state.units[0].frame.querySelector('[data-block-drop-marker]')?.parentElement?.getBoundingClientRect();
    state.line.style.top = `${((gap.top+gap.bottom)/2-editor.top)/scale-1.5}px`;
    state.line.style.left = `${((content?.left ?? editor.left)-editor.left)/scale}px`;
    state.line.style.width = `${(content?.width ?? editor.width)/scale}px`;
}
function showPreviewLine(state: Preview) {
    if (!state.line) {
        const marker = state.units[0].frame.querySelector<HTMLElement>('[data-block-drop-marker]');
        if (!marker) return;
        state.line = document.createElement('span');
        state.line.className = marker.className;
        state.line.setAttribute('data-reorder-insertion-line','');
        state.line.setAttribute('aria-hidden','true');
        state.line.style.display = 'block'; state.line.style.right = 'auto';
        state.editor.appendChild(state.line);
        state.editor.setAttribute('data-reorder-line','');
    }
    if (state.animationFrame !== null) cancelAnimationFrame(state.animationFrame);
    // Follow the midpoint of the actual visible gap while peers settle. The
    // line belongs to the editor, not either moving neighbor's top/bottom edge.
    const until = performance.now()+320;
    const draw = () => {
        if (preview !== state || !state.line) return;
        positionPreviewLine(state);
        state.animationFrame = !reducedMotion() && performance.now()<until ? requestAnimationFrame(draw) : null;
    };
    draw();
}
function stopListening() {
    document.removeEventListener('drop', onDrop, true);
    window.removeEventListener('dragend', cancelReorderPreview, true);
    window.removeEventListener('keydown', onKey, true);
}
export function cancelReorderPreview() {
    resetTransforms();
    for (const unit of preview?.units ?? []) { unit.element.removeAttribute('data-reorder-source'); unit.element.removeAttribute('data-reorder-preview-item'); unit.frame.removeAttribute('data-reorder-preview-item'); }
    stopListening(); preview = null;
}
function onKey(event: KeyboardEvent) { if (event.key === 'Escape') cancelReorderPreview(); }
function onDrop(event: DragEvent) {
    if (preview) {
        previewReorderAt((event.target as Element)?.closest('[data-chnk-it-block-editor]') ?? null,event.clientY);
        preview.committing = true;
    }
    // Capture the on-screen positions before React commits the new order.
    // Reset transforms before that commit, then settle any remaining delta.
    const units = preview?.units ?? [];
    const moving = preview?.moving ?? new Set<string>();
    const positions = new Map(units.map(unit => [unit.element, unit.element.getBoundingClientRect().top]));
    for (const unit of units) unit.element.setAttribute('data-reorder-reset','');
    resetTransforms();
    requestAnimationFrame(() => {
        for (const unit of units) {
            const element = unit.element;
            element.removeAttribute('data-reorder-reset');
            if (!element.isConnected || reducedMotion() || moving.has(unit.id)) continue;
            const delta = ((positions.get(element) ?? 0) - element.getBoundingClientRect().top) / unit.scale;
            if (Math.abs(delta) > 1) element.animate([{translate:`0 ${delta}px`},{translate:'0 0'}], {duration:160,easing:'cubic-bezier(0.22, 0.9, 0.3, 1)'});
        }
    });
    // Drop handlers still need the original hit geometry in this event.
    setTimeout(cancelReorderPreview,0);
}

/** Snapshot once. Hit testing never reads the moving preview, so a stationary
 * pointer cannot toggle two positions back and forth as the blocks animate. */
export function beginReorderPreview(source: HTMLElement, ids: string[]) {
    cancelReorderPreview();
    const editor = source.closest<HTMLElement>('[data-chnk-it-block-editor]');
    if (!editor) return;
    // Media keeps its three-way native insert/merge bands. A merge changes
    // structure rather than the sibling order being previewed here.
    if (['image','video','file','media','gallery'].includes(source.dataset.blockType ?? '')) return;
    const origin = editor.getBoundingClientRect().top;
    const units = [...editor.querySelectorAll<HTMLElement>('[data-block-id]')]
        .filter(frame => frame.closest('[data-chnk-it-block-editor]') === editor && Number(frame.dataset.blockIndent ?? 0) === 0)
        .map(frame => {
            const parent = frame.parentElement;
            const group = parent && parent.dataset.reorderGroupId === frame.dataset.blockId ? parent : frame;
            const box = group.getBoundingClientRect();
            const header = frame.getBoundingClientRect();
            return {id:frame.dataset.blockId!,frame,element:group,top:box.top-origin,height:box.height,headerTop:header.top-origin,headerHeight:header.height,scale:box.height / (group.offsetHeight || box.height || 1)};
        });
    const moving = new Set(units.filter(unit => ids.includes(unit.id)).map(unit=>unit.id));
    if (!moving.size || units.length < 2) return;
    preview = {editor,units,moving,target:null,slot:'',pending:null,gap:null,line:null,animationFrame:null,committing:false};
    for (const unit of units) {
        unit.element.setAttribute('data-reorder-preview-item',''); unit.frame.setAttribute('data-reorder-preview-item','');
    }
    document.addEventListener('drop',onDrop,true);
    window.addEventListener('dragend',cancelReorderPreview,true);
    window.addEventListener('keydown',onKey,true);
}

export function previewReorderAt(editor: Element | null, clientY: number): Preview['target'] {
    const state = preview;
    if (!state) return null;
    // Only hide after native dragstart has finished; hiding its source during
    // dragstart cancels the native gesture in some engines. Keep it hidden even
    // while returning peers to rest, so two texts can never share one position.
    for (const unit of state.units) if (state.moving.has(unit.id)) unit.element.setAttribute('data-reorder-source','');
    if (state.editor !== editor) { resetTransforms(); state.target=null; return null; }
    if (state.committing) return state.target;
    const bounds = gapBounds(state);
    // Every point of the opened slot means the same insertion. In particular,
    // its upper and lower edges must not expose competing destination lines.
    if (bounds && clientY >= bounds.top && clientY <= bounds.bottom && state.target) return state.target;
    const y = clientY - state.editor.getBoundingClientRect().top;
    const unit = state.units.find(unit=>y < unit.top+unit.height) ?? state.units[state.units.length-1];
    const position = y < unit.headerTop+unit.headerHeight/2 ? 'top' : 'bottom';
    const target = {blockId:unit.id,position} as const;
    if (state.target?.blockId === target.blockId && state.target.position === target.position) return target;
    state.target = target;
    // Insertion into a toggle's body changes hierarchy; its ordinary marker
    // remains truthful without flattening that branch for a visual preview.
    if (state.moving.has(unit.id) || (unit.frame.dataset.blockType === 'toggle' && position === 'bottom')
        || unit.frame.dataset.blockType === 'gallery') { resetTransforms(); return target; }
    const moving = state.units.filter(unit=>state.moving.has(unit.id));
    const next = state.units.filter(unit=>!state.moving.has(unit.id));
    const index = next.findIndex(item=>item.id===unit.id)+(position==='bottom'?1:0);
    next.splice(index,0,...moving);
    // Adjacent bottom/top targets describe the same insertion slot. Do not
    // restart motion when the pointer crosses that purely semantic boundary.
    const slot = JSON.stringify(next.map(item=>item.id));
    if (state.slot === slot) return target;
    if (state.pending) clearTimeout(state.pending);
    state.slot = slot;
    const gap = state.units.length > 1 ? Math.max(0,state.units[1].top-state.units[0].top-state.units[0].height) : 0;
    state.gap = {before:next[index-1],after:next[index+moving.length],height:moving.reduce((sum,item)=>sum+item.height+gap,0)};
    const apply = () => {
        state.pending = null;
        if (preview !== state) return;
        let top = state.units[0].top;
        for (const item of next) {
            item.element.style.setProperty('--block-reorder-y',`${state.moving.has(item.id) ? 0 : (top-item.top)/item.scale}px`);
            top += item.height+gap;
        }
    };
    // The line and drop destination respond immediately. Neighbor movement
    // waits for intent, so passing over a long document does not shuffle it.
    if (reducedMotion()) apply();
    else state.pending = setTimeout(apply, 100);
    showPreviewLine(state);
    return target;
}

export function pauseReorderPreview(editor: Element) {
    if (preview?.editor === editor) { resetTransforms(); preview.target=null; }
}
