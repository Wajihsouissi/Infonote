let cleanup: (() => void) | null = null;

/** Carry the rendered block itself, at its current canvas scale. Native drag
 * still owns the gesture and data transfer; this presentation layer adds no
 * second caption, panel or shadow and never participates in hit testing. */
export function startBlockDragVisual(event: DragEvent, source: HTMLElement, ids:readonly string[]=[source.dataset.blockId!]) {
    cleanup?.();
    const editor=source.closest('[data-chnk-it-block-editor]');
    const wanted=new Set(ids);
    const frames=editor?[...editor.querySelectorAll<HTMLElement>('[data-block-id]')].filter(frame=>wanted.has(frame.dataset.blockId!)&&frame.closest('[data-chnk-it-block-editor]')===editor):[source];
    const groups=frames.map(frame=>frame.parentElement?.dataset.reorderGroupId===frame.dataset.blockId?frame.parentElement!:frame);
    const renderedBlocks=groups.filter((frame,index)=>groups.indexOf(frame)===index&&!groups.some(other=>other!==frame&&other.contains(frame)));
    if(!renderedBlocks.length)renderedBlocks.push(source);
    const first=renderedBlocks[0];
    const box=first.getBoundingClientRect();
    const scale=box.width/(first.offsetWidth||box.width||1);
    const gap=parseFloat(getComputedStyle(editor??source).rowGap)||0;
    const floating = document.createElement('div');
    floating.setAttribute('data-carried-block','');
    floating.setAttribute('data-carried-block-count',String(renderedBlocks.length));
    floating.setAttribute('aria-hidden','true');
    floating.inert = true;
    Object.assign(floating.style,{position:'fixed',left:'0',top:'0',width:'max-content',maxWidth:`${box.width}px`,pointerEvents:'none',zIndex:'10000',display:'flex',alignItems:'flex-start',flexDirection:'column',gap:`${gap*scale}px`});
    for(const rendered of renderedBlocks){
    const copy = rendered.cloneNode(true) as HTMLElement;
    const computed = getComputedStyle(rendered);
    // A transparent text frame must not inherit the full editor/card surface.
    // Keep real content backgrounds (code, media, callouts) on their children.
    // Text uses its intrinsic width, capped at the original wrapping width.
    const frames=rendered.matches('[data-block-type]')?[rendered]:[...rendered.querySelectorAll<HTMLElement>('[data-block-type]')];
    const isText=frames.length>0&&frames.every(frame=>['text','heading1','heading2','heading3','bullet','numbered','todo','toggle','quote'].includes(frame.dataset.blockType!));
    // Editor typography and spacing tokens can be scoped below the body.
    for (const name of computed) if (name.startsWith('--')) copy.style.setProperty(name,computed.getPropertyValue(name));
    Object.assign(copy.style,{width:isText?'max-content':`${rendered.offsetWidth}px`,maxWidth:`${rendered.offsetWidth}px`,font:computed.font,color:computed.color,margin:'0',flexShrink:'0',zoom:String(scale),
        transform:'none',transformOrigin:'top left',translate:'0 0',transition:'none',opacity:'1',visibility:'visible',outline:'none',boxShadow:'none',backgroundColor:'transparent'});
    copy.querySelectorAll('[data-block-drop-marker],button[class*="dragHandle"]').forEach(element=>element.remove());
    for (const element of [copy,...copy.querySelectorAll<HTMLElement>('*')]) {
        for (const name of ['id','data-block-id','data-chnk-it-block-editor','data-reorder-group-id','data-reorder-preview-item','data-reorder-source','data-external-drop-target']) element.removeAttribute(name);
        if (element.hasAttribute('contenteditable')) element.contentEditable = 'false';
        element.draggable = false;
    }
    floating.appendChild(copy);
    }
    const offsetX = event.clientX-box.left, offsetY = event.clientY-box.top;
    const move = (event: DragEvent) => { floating.style.transform=`translate3d(${event.clientX-offsetX}px,${event.clientY-offsetY}px,0)`; };
    move(event);
    document.body.appendChild(floating);
    // Suppress the browser's translucent screenshot; the opaque rendered block
    // above follows the pointer instead. Canvas is intentionally transparent.
    const empty = document.createElement('canvas'); empty.width=1; empty.height=1;
    // WebKit cancels a native drag when its image is a detached canvas.
    // Keep the transparent image connected for the lifetime of the gesture.
    empty.setAttribute('aria-hidden','true');
    Object.assign(empty.style,{position:'fixed',left:'0',top:'0',opacity:'0',pointerEvents:'none'});
    document.body.appendChild(empty);
    event.dataTransfer?.setDragImage(empty,0,0);
    const stop = () => {
        empty.remove();
        floating.remove();
        document.removeEventListener('dragover',move,true);
        document.removeEventListener('drop',stop,true);
        window.removeEventListener('dragend',stop,true);
        window.removeEventListener('keydown',key,true);
        if (cleanup === stop) cleanup = null;
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') stop(); };
    cleanup = stop;
    document.addEventListener('dragover',move,true);
    document.addEventListener('drop',stop,true);
    window.addEventListener('dragend',stop,true);
    window.addEventListener('keydown',key,true);
}
