import { motion, AnimatePresence } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { useStore } from '../../store/useStore';
import { getNodeById } from '../../store/nodeIndex';
import styles from './FullscreenModal.module.css';
import { ArrowRightLeft } from '../../components/icons';
import { type AppNode } from '../../types';
import { FullscreenNoteList } from './FullscreenNoteList';
import { resolvePeekContent } from './peekContent';
import { isFileNode } from '../file';

/**
 * Which half of a split the next pick from the rail lands in. The store keeps
 * only `fullscreenId` — the left pane — because a split is a way of reading,
 * not a property of the canvas: it should not survive leaving fullscreen, and
 * it has no business in a saved graph.
 */
export type FullscreenPane = 'left' | 'right';

/** Neither pane may be dragged narrower than this share of the split area. */
const MIN_PANE_RATIO = 0.2;
const MAX_PANE_RATIO = 1 - MIN_PANE_RATIO;

export function FullscreenModal({
    onCanvasDragOver,
    onCanvasDrop
}: {
    onCanvasDragOver?: (e: React.DragEvent) => void;
    onCanvasDrop?: (e: React.DragEvent) => void;
}) {
    // Atomic Selectors
    const fullscreenId = useStore(s => s.fullscreenId);
    const setFullscreenId = useStore(s => s.setFullscreenId);
    const updateNodeData = useStore(s => s.updateNodeData);
    // Only subscribe to the specific node we need, not the entire array
    const activeNode = useStore(s => getNodeById(s.nodes, fullscreenId ?? undefined));
    const navigateToNode = useStore(s => s.navigateToNode);

    const [secondaryId, setSecondaryId] = useState<string | null>(null);
    const [focusedPane, setFocusedPane] = useState<FullscreenPane>('left');
    const secondaryNode = useStore(s => getNodeById(s.nodes, secondaryId ?? undefined));

    /* The split only stands while both halves hold a real, distinct node —
       leaving fullscreen, deleting the card in the right pane, or opening the
       same card twice all have to drop it, or the pane keeps chrome for a note
       that is not there. */
    useEffect(() => {
        if (!fullscreenId) {
            setSecondaryId(null);
            setFocusedPane('left');
        } else if (secondaryId && (secondaryId === fullscreenId || !secondaryNode)) {
            setSecondaryId(null);
            setFocusedPane('left');
        }
    }, [fullscreenId, secondaryId, secondaryNode]);

    const isSplit = Boolean(secondaryId && secondaryNode);

    // Share of the split area the left pane gets; the right pane takes the rest.
    const [splitRatio, setSplitRatio] = useState(0.5);
    const splitAreaRef = useRef<HTMLDivElement | null>(null);
    const wasSplitRef = useRef(false);

    /* Reset only when a split *begins* — dragging the divider, then swapping
       sides or loading a different card into the right pane, should keep the
       layout the reader set rather than snapping back to even every time. */
    useEffect(() => {
        if (isSplit && !wasSplitRef.current) setSplitRatio(0.5);
        wasSplitRef.current = isSplit;
    }, [isSplit]);

    /**
     * Drag the seam to resize both panes at once. Ratio, not pixels: the panes
     * are flex children sharing one row, so the natural unit is "how much of
     * that row" rather than an absolute width that would go stale the moment
     * the window resizes.
     */
    const handleSeamDragStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const area = splitAreaRef.current;
        if (!area) return;

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMove = (moveEvent: MouseEvent) => {
            const rect = area.getBoundingClientRect();
            const ratio = (moveEvent.clientX - rect.left) / rect.width;
            setSplitRatio(Math.min(MAX_PANE_RATIO, Math.max(MIN_PANE_RATIO, ratio)));
        };

        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, []);

    /** A pick from the rail lands in whichever pane the reader last touched. */
    const openInFocusedPane = useCallback((id: string) => {
        if (isSplit && focusedPane === 'right') {
            setSecondaryId(id);
        } else {
            setFullscreenId(id);
        }
    }, [isSplit, focusedPane, setFullscreenId]);

    const openInSecondPane = useCallback((id: string) => {
        if (id === fullscreenId) return;
        setSecondaryId(id);
        setFocusedPane('right');
    }, [fullscreenId]);

    /* Ctrl/Cmd + \\ opens the next card beside the current one. Repeating the
       shortcut returns to one focused pane, so split view stays a reversible
       reading mode rather than a sticky layout decision. */
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (!(event.metaKey || event.ctrlKey) || event.key !== '\\') return;
            event.preventDefault();
            if (isSplit) {
                setSecondaryId(null);
                setFocusedPane('left');
                return;
            }

            const parentId = activeNode?.parentId ?? null;
            // The same set the rail lists — cards and files — so the split
            // shortcut can reach anything the reader can see beside it.
            const siblings = useStore.getState().nodes
                .filter((node) => (node.type === 'note' || isFileNode(node))
                    && (node.parentId ?? null) === parentId
                    && node.id !== fullscreenId)
                .sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x));
            if (!siblings[0]) return;
            setSecondaryId(siblings[0].id);
            setFocusedPane('right');
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [activeNode?.parentId, fullscreenId, isSplit]);

    const handleClose = () => {
        setFullscreenId(null);
    };

    /* Closing the left half of a split is not the same as leaving fullscreen:
       the right half slides over and becomes the single open note. Only a lone
       pane's close button drops out of fullscreen entirely. */
    const closeLeftPane = useCallback(() => {
        if (isSplit && secondaryId) {
            setFullscreenId(secondaryId);
            setSecondaryId(null);
            setFocusedPane('left');
        } else {
            handleClose();
        }
        // handleClose is re-made every render and only reads refs/store setters.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSplit, secondaryId, setFullscreenId]);

    const closeRightPane = useCallback(() => {
        setSecondaryId(null);
        setFocusedPane('left');
    }, []);

    const swapPanes = useCallback(() => {
        if (!isSplit || !secondaryId || !fullscreenId) return;
        const previousLeft = fullscreenId;
        setFullscreenId(secondaryId);
        setSecondaryId(previousLeft);
        setFocusedPane(p => (p === 'left' ? 'right' : 'left'));
    }, [isSplit, secondaryId, fullscreenId, setFullscreenId]);

    /**
     * Both halves use the same fullscreen shell. Notes get their card chrome,
     * boards get their real columns, and anything else gets a bare editor.
     */
    const renderPane = (
        pane: FullscreenPane,
        id: string,
        node: AppNode,
        onPaneClose: () => void
    ) => (
        <div
            className={`${styles.stage} ${pane === 'left' ? styles.paneLeft : styles.paneRight} ${isSplit ? styles.stageSplit : ''} ${isSplit && focusedPane === pane ? styles.stageFocused : ''} ${node.type === 'kanban' ? styles.boardStage : ''}`}
            /* flex-basis: 0% and a matching flex-grow is how a flex child takes
               an exact share of the row rather than sizing to its content —
               same trick a resizable pane always needs. Only set once a split
               is live: outside one the plain `flex: 1 1 0` from .stageSplit
               would otherwise be undone by a stale drag ratio. */
            style={isSplit ? { flex: `${pane === 'left' ? splitRatio : 1 - splitRatio} 1 0%` } : undefined}
            /* Capture, so focusing a pane wins even when the click lands on the
               editor inside it and never bubbles back out. */
            onMouseDownCapture={() => setFocusedPane(pane)}
        >
            {node.type === 'kanban' ? (
                <div className={styles.boardFullscreenCanvas}>
                    {resolvePeekContent({
                        node,
                        nodeId: id,
                        onUpdate: updateNodeData,
                        onClose: onPaneClose,
                        allowBoard: true,
                    })}
                </div>
            ) : (
                resolvePeekContent({
                    node,
                    nodeId: id,
                    onUpdate: updateNodeData,
                    onClose: onPaneClose,
                    flatCorners: true,
                    onNavigate: () => {
                        handleClose();
                        navigateToNode(id);
                    },
                    editorClassName: styles.editorContainer,
                })
            )}
        </div>
    );

    return (
        <AnimatePresence>
            {fullscreenId && activeNode && (
                <motion.div
                    className={styles.overlay}
                    initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                    animate={{ opacity: 1, backdropFilter: 'blur(4px)' }}
                    exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                    transition={{ duration: 0.2 }}
                    onClick={(event) => {
                        // A portalled cover picker belongs to the active pane;
                        // never treat its click as a fullscreen-backdrop close.
                        if ((event.target as HTMLElement).closest('[data-cover-picker]')) return;
                        handleClose();
                    }}
                    onDragOver={(e: DragEvent<HTMLDivElement>) => {
                        if (onCanvasDragOver) {
                            onCanvasDragOver(e);
                        } else {
                            e.preventDefault();
                            e.stopPropagation();
                        }
                    }}
                    onDrop={(e: DragEvent<HTMLDivElement>) => {
                        if (onCanvasDrop) {
                            onCanvasDrop(e);
                        } else {
                            e.stopPropagation();
                        }
                    }}
                >
                    <motion.div 
                        className={styles.modal} 
                        onClick={(e) => e.stopPropagation()}
                        initial={{ opacity: 0, scale: 0.95, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    >
                        <div className={`${styles.workspace} ${activeNode.type === 'kanban' ? styles.boardWorkspace : ''}`}>
                            {activeNode.type !== 'kanban' && (
                                <FullscreenNoteList
                                    leftId={fullscreenId}
                                    rightId={isSplit ? secondaryId : null}
                                    focusedPane={focusedPane}
                                    onSelect={openInFocusedPane}
                                    onOpenSplit={openInSecondPane}
                                />
                            )}

                            <div className={styles.splitArea} ref={splitAreaRef}>
                                {/* Panes are keyed on their card: both editors
                                    read their content once at mount, so
                                    switching cards from the rail has to remount
                                    them or the card just left stays on screen. */}
                                {renderPane('left', fullscreenId, activeNode, closeLeftPane)}

                                {isSplit && secondaryId && secondaryNode && (
                                    <>
                                        <div className={styles.seam}>
                                            {/* The wider invisible strip is the
                                                drag target — a 1px line is too
                                                thin to reliably grab, so the hit
                                                area extends past it on both
                                                sides without widening the seam
                                                itself in the flex layout. */}
                                            <div
                                                className={styles.seamHandle}
                                                onMouseDown={handleSeamDragStart}
                                                role="separator"
                                                aria-orientation="vertical"
                                                aria-label="Resize split"
                                            >
                                                <span className={styles.seamGrip} aria-hidden="true" />
                                                <span className={styles.seamTooltip}>Resize</span>
                                            </div>

                                            {/* A sibling of the drag strip, not
                                                a child — so its own mousedown
                                                never has to fight the drag
                                                handler for the event. */}
                                            <button
                                                className={`${styles.seamButton} icon-hover`}
                                                onClick={swapPanes}
                                                title="Swap sides"
                                                aria-label="Swap sides"
                                            >
                                                <ArrowRightLeft size={14} />
                                            </button>
                                        </div>

                                        {renderPane('right', secondaryId, secondaryNode, closeRightPane)}
                                    </>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
