import type {Edge} from '@xyflow/react';
import {getNodeBlocks,type AppNode} from '../../../types';
import type {Block} from '../types';
import {transferWithinDocument} from './blockReorder';
import {rebasePastedBlocks} from '../document/pasteBlocks';

function blockIds(blocks:Block[]):Set<string>{
    const ids=new Set<string>(),pending=[blocks];
    while(pending.length)for(const block of pending.pop()!){
        ids.add(block.id);
        for(const key of ['blocks','content','items'] as const){const children=block.metadata?.[key];if(Array.isArray(children))pending.push(children as Block[]);}
        for(const column of block.metadata?.columns??[])if(Array.isArray(column.content))pending.push(column.content);
    }
    return ids;
}

export function insertTransferredBlocks(target:Block[],moving:Block[],id:string|null,position:'top'|'bottom'):Block[]{
    if(!moving.length)return target;
    if(!id)return target.concat(rebasePastedBlocks(moving,0));
    return transferWithinDocument(target,moving,id,position);
}

/** A destination inside the source would make ownership cyclic. */
export function canTransferNodeInto(nodes:readonly AppNode[],sourceId:string,targetId:string):boolean{
    const seen=new Set<string>();let id:string|undefined=targetId;
    while(id){if(id===sourceId||seen.has(id))return false;seen.add(id);id=nodes.find(node=>node.id===id)?.parentId;}
    return nodes.some(node=>node.id===sourceId)&&nodes.some(node=>node.id===targetId);
}

/** Consume a canvas block/fused node in one immutable graph operation. Page
 * children and connections follow their content into its new document owner. */
export function planCanvasBlockTransfer(nodes:AppNode[],edges:Edge[],sourceId:string,targetId:string,blockId:string|null,position:'top'|'bottom'){
    if(!canTransferNodeInto(nodes,sourceId,targetId))return null;
    const source=nodes.find(node=>node.id===sourceId)!,target=nodes.find(node=>node.id===targetId)!;
    if(!['block','fused-note'].includes(source.type??'')||!['note','block','fused-note'].includes(target.type??''))return null;
    const moving=getNodeBlocks(source.data)??[],previous=getNodeBlocks(target.data)??[];
    if(!moving.length)return null;
    const incomingIds=blockIds(moving);
    if([...blockIds(previous)].some(id=>incomingIds.has(id)))return null;
    const content=insertTransferredBlocks(previous,moving,blockId,position);
    if(content===previous)return null;
    const next=nodes.filter(node=>node.id!==sourceId).map(node=>{
        if(node.id===targetId)return {...node,type:node.type==='block'?'fused-note':node.type,
            style:node.type==='block'?{...node.style,width:432,height:208}:node.style,
            data:{...node.data,content}} as AppNode;
        return node.parentId===sourceId?{...node,parentId:targetId}:node;
    });
    const ordered:AppNode[]=[],seen=new Set<string>(),byId=new Map(next.map(node=>[node.id,node]));
    const append=(node:AppNode)=>{if(seen.has(node.id))return;seen.add(node.id);const parent=node.parentId?byId.get(node.parentId):undefined;if(parent)append(parent);ordered.push(node);};
    next.forEach(append);
    const nextEdges=edges.map(edge=>edge.source===sourceId||edge.target===sourceId?{...edge,
        source:edge.source===sourceId?targetId:edge.source,target:edge.target===sourceId?targetId:edge.target}:edge)
        .filter(edge=>edge.source!==edge.target);
    return {nodes:ordered,edges:nextEdges};
}
