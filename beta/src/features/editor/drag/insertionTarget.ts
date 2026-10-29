export interface InsertionUnit { id:string; top:number; bottom:number; }
export interface InsertionTarget { blockId:string; position:'top'|'bottom'; index:number; boundary:number; }

/** Both sides of the same document gap resolve to one insertion. Geometry is
 * captured before preview transforms, so moving peers cannot change the slot. */
export function insertionTarget(units:readonly InsertionUnit[],y:number):InsertionTarget|null {
    if(!units.length)return null;
    for(let i=0;i<units.length;i++){
        const unit=units[i];
        if(y<(unit.top+unit.bottom)/2){
            return {blockId:unit.id,position:'top',index:i,boundary:i ? (units[i-1].bottom+unit.top)/2 : unit.top};
        }
    }
    const last=units[units.length-1];
    return {blockId:last.id,position:'bottom',index:units.length,boundary:last.bottom};
}
