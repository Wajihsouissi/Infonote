/** A brief landing cue on incoming content. It never scales the node, changes
 * layout/history, or runs on typing/reorders that retain the same identities. */
export function animateBlockArrival(nodeId:string,ids:readonly string[]){
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return ()=>{};
    let frame:number|null=null,attempts=0,stopped=false;
    const animations:Animation[]=[];
    const find=()=>{
        if(stopped)return;
        const root=document.querySelector(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`);
        const elements=ids.flatMap(id=>{const element=root?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`);return element?[element]:[];});
        if(!elements.length&&++attempts<6){frame=requestAnimationFrame(find);return;}
        for(const element of elements.filter(element=>!elements.some(other=>other!==element&&other.contains(element)))){
            if(element.getAnimations().some(animation=>animation.id==='chnk-it-block-arrival'))continue;
            const animation=element.animate([{opacity:.82,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:160,easing:'cubic-bezier(0.16, 1, 0.3, 1)'});
            animation.id='chnk-it-block-arrival';animations.push(animation);
        }
    };
    frame=requestAnimationFrame(find);
    return ()=>{stopped=true;if(frame!==null)cancelAnimationFrame(frame);for(const animation of animations)animation.cancel();};
}
