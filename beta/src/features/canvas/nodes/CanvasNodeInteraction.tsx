import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useConnection } from '@xyflow/react';
import { useStore } from '../../../store/useStore';
import { getNodeBlocks, type AppNodeData } from '../../../types';
import { dragHasType } from '../../editor/drag/dragSession';
import { previewBlockInsertion, clearOwnedBlockInsertionPreview } from '../../editor/drag/blockInsertionPreview';
import { animateBlockArrival } from '../../editor/drag/blockArrival';
import { CanvasNodeToolbar } from './CanvasNodeToolbar';
import styles from './CanvasNodeInteraction.module.css';

const connecting = (connection: { inProgress: boolean }) => connection.inProgress;

/** One selection-before-interaction policy for every canvas node renderer.
 * Keep the content mounted: inert protects native controls and iframe documents
 * without replacing editors or attaching handlers to every descendant.
 */
export function CanvasNodeInteraction({ id, selected, nodeType, data, children, controls }: {
    id: string; selected: boolean; nodeType: string; data: AppNodeData; children: ReactNode; controls?: ReactNode;
}) {
    const soleSelection = useStore(s => s.selectedCanvasNodeIds.size === 1 && s.selectedCanvasNodeIds.has(id));
    const linking = useStore(s => s.isLinkingMode);
    const isConnecting = useConnection(connecting);
    const passive = !(selected && soleSelection) && !linking && !isConnecting;
    const contentRef = useRef<HTMLDivElement>(null);
    const surfaceRef = useRef<HTMLDivElement>(null);
    const previousBlocks = useRef(new Set((getNodeBlocks(data)??[]).map(block=>block.id)));
    useLayoutEffect(()=>{
        const ids=(getNodeBlocks(data)??[]).map(block=>block.id);
        const arriving=ids.filter(blockId=>!previousBlocks.current.has(blockId));
        previousBlocks.current=new Set(ids);
        if(arriving.length)return animateBlockArrival(id,arriving);
    },[id,data]);

    useEffect(() => {
        const surface = surfaceRef.current;
        if (!surface) return;
        const wheel = (event: WheelEvent) => {
            if (event.ctrlKey) return; // Pinch still belongs to the canvas.
            const area = contentRef.current?.querySelector<HTMLElement>(
                '.infonote-scrollable, [data-scrollable="true"], .ProseMirror',
            );
            if (!area) return;
            const before = area.scrollTop;
            area.scrollTop += event.deltaY;
            if (Math.abs(area.scrollTop - before) > 0.5) {
                event.preventDefault();
                event.stopPropagation();
            }
        };
        surface.addEventListener('wheel', wheel, { passive: false });
        return () => surface.removeEventListener('wheel', wheel);
    }, [passive]);

    return <>
        <div ref={contentRef} className={styles.content} inert={passive || undefined}
            data-canvas-node-interaction={passive ? 'move' : 'interact'}>
            {children}
        </div>
        {!linking && !isConnecting && <CanvasNodeToolbar id={id} nodeType={nodeType} data={data} />}
        {!linking && !isConnecting && controls}
        {passive && <div ref={surfaceRef}
            className={`interaction-overlay custom-drag-handle ${styles.surface}`}
            aria-hidden="true"
            onDragOver={event => {
                if (dragHasType(event,'application/reactflow-block-type') && contentRef.current) {
                    event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect='move';
                    const node = useStore.getState().nodes.find(node=>node.id===id);
                    const root=contentRef.current.closest<HTMLElement>('.react-flow__node');
                    if(root)previewBlockInsertion(root,(node ? getNodeBlocks(node.data)??[]:[]).map(block=>block.id),event.clientY,document.querySelector('[data-carried-block]')?.getBoundingClientRect().height);
                    return;
                }
                if (event.dataTransfer.types.includes('Files') && contentRef.current?.querySelector('.mediaPlaceholderTrigger')) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'copy';
                }
            }}
            onDragLeave={event=>{const box=event.currentTarget.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)clearOwnedBlockInsertionPreview(contentRef.current?.closest('.react-flow__node')??null);}}
            onDrop={event => {
                const picker = contentRef.current?.querySelector<HTMLElement>('.mediaPlaceholderTrigger');
                if (!picker || !event.dataTransfer.files.length) return;
                event.preventDefault();
                event.stopPropagation();
                picker.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: event.dataTransfer }));
            }}
        />}
    </>;
}
