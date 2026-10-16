import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { calculateNoteLayout, MIN_EXPANDED_SIZE } from '../../config/layout';
import { useStore } from '../../store/useStore';
import { getNodeById } from '../../store/nodeIndex';
import { ResizeArc } from '../../components/ui/ResizeArc';
import styles from './NoteCard.module.css';

interface CardResizeHandleProps {
    id: string;
    cardRef: React.RefObject<HTMLDivElement | null>;
    /** The note body, measured when fitting the card to its content. */
    contentRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Snap a card to a valid layout and write it — size and the view mode that
 * size implies together, in one store update, from the node's current data
 * (never a copy captured when the gesture began).
 */
function applyLayout(id: string, rawWidth: number, rawHeight: number) {
    const { width, height, mode } = calculateNoteLayout(rawWidth, rawHeight);
    const { nodes, updateNode } = useStore.getState();
    const node = getNodeById(nodes, id);
    if (node?.type !== 'note') return;
    const sameSize = node.style?.width === width && node.style?.height === height;
    const sameMode = (node.data.viewMode || 'medium') === mode;
    if (sameSize && sameMode) return;
    updateNode(id, { style: { width, height }, data: { ...node.data, viewMode: mode } });
}

/**
 * The corner handle of a note card. Dragging resizes through the shared note
 * layout rules (so the card changes view mode as it crosses a size); a
 * double-click fits the card to its content.
 */
export function CardResizeHandle({ id, cardRef, contentRef }: CardResizeHandleProps) {
    const { getViewport } = useReactFlow();

    const fitToContent = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const card = cardRef.current;
        if (!card) return;

        const content = contentRef.current;
        // The note area is flexed to the current node height, so its own
        // clientHeight cannot say whether the node is too tall. Its first child
        // flows naturally; that scroll size is the real content.
        const measured = (content?.firstElementChild as HTMLElement | null) ?? content ?? card;
        const contentWidth = Math.max(measured.scrollWidth, measured === card ? card.clientWidth : 0);
        const contentHeight = Math.max(measured.scrollHeight, measured === card ? card.clientHeight : 0);

        // Keep the chrome around the note area (header, padding) in the size.
        const chromeWidth = content ? Math.max(0, card.clientWidth - content.clientWidth) : 0;
        const chromeHeight = content ? Math.max(0, card.clientHeight - content.clientHeight) : 0;

        // A card with a body stays in the expanded family; its minimum is part
        // of the layout contract.
        const node = getNodeById(useStore.getState().nodes, id);
        const hasBlocks = node?.type === 'note' && Array.isArray(node.data.content) && node.data.content.length > 0;
        const minimum = hasBlocks ? MIN_EXPANDED_SIZE : 0;
        applyLayout(id, Math.max(minimum, contentWidth + chromeWidth), Math.max(minimum, contentHeight + chromeHeight));
    }, [cardRef, contentRef, id]);

    const startResize = useCallback((e: React.MouseEvent) => {
        // React Flow can consume the native dblclick once a drag begins.
        // `detail === 2` arrives on the second press, before that takeover.
        if (e.detail === 2) {
            fitToContent(e);
            return;
        }
        e.stopPropagation(); // not a node drag
        e.preventDefault();

        const card = cardRef.current;
        if (!card) return;
        const { zoom } = getViewport();
        const startX = e.clientX;
        const startY = e.clientY;
        const rect = card.getBoundingClientRect();
        const startWidth = rect.width / zoom;
        const startHeight = rect.height / zoom;

        const resizeTo = (event: MouseEvent) => applyLayout(
            id,
            startWidth + (event.clientX - startX) / zoom,
            startHeight + (event.clientY - startY) / zoom,
        );
        const finish = (event: MouseEvent) => {
            document.body.style.cursor = '';
            document.body.classList.remove('chnk-it-resizing-active');
            window.removeEventListener('mousemove', resizeTo);
            window.removeEventListener('mouseup', finish);
            resizeTo(event);
        };

        document.body.style.cursor = 'nwse-resize';
        document.body.classList.add('chnk-it-resizing-active');
        window.addEventListener('mousemove', resizeTo);
        window.addEventListener('mouseup', finish);
    }, [cardRef, fitToContent, getViewport, id]);

    return (
        <div
            className={`${styles.modernResizeHandle} nodrag`}
            onDoubleClick={fitToContent}
            onMouseDown={startResize}
            title="Drag to resize · double-click to fit content"
        >
            <ResizeArc pathClassName={styles.handlePath} />
        </div>
    );
}
