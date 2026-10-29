import {validClipboardBlocks} from '../../clipboard/clipboardPayload';
import {getNodeBlocks,type AppNode} from '../../../types';
import type {Block} from '../types';
import {blocksForDrag} from './blockReorder';

/** JSON locates a drag; the live document owns its current text and metadata. */
export function resolveBlockDragPayload(raw:string,nodes:readonly AppNode[]):{sourceNodeId:string|null;blocks:Block[]}|null{
    let value:{sourceNodeId?:unknown;blocks?:unknown;block?:unknown};
    try{value=JSON.parse(raw);}catch{return null;}
    if(!value||typeof value!=='object')return null;
    const blocks=value.blocks??(value.block?[value.block]:null);
    if(!validClipboardBlocks(blocks)||!blocks.length)return null;
    const ids=new Set(blocks.map(block=>block.id));
    if(ids.size!==blocks.length||ids.has(''))return null;
    if(value.sourceNodeId==null)return {sourceNodeId:null,blocks};
    if(typeof value.sourceNodeId!=='string')return null;
    const source=nodes.find(node=>node.id===value.sourceNodeId),root=source?getNodeBlocks(source.data):undefined;
    if(!root)return null;
    const pending=[root];
    while(pending.length){
        const list=pending.pop()!,present=new Set(list.map(block=>block.id));
        if([...ids].every(id=>present.has(id)))return {sourceNodeId:value.sourceNodeId,blocks:blocksForDrag(list,ids)};
        for(const block of list){
            for(const key of ['blocks','content','items'] as const){const children=block.metadata?.[key];if(Array.isArray(children))pending.push(children as Block[]);}
            for(const column of block.metadata?.columns??[])if(Array.isArray(column.content))pending.push(column.content);
        }
    }
    return null;
}
